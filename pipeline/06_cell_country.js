// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 6. Довідник «клітинка 0,25° → країна / область»: cell_id, iso3, region_id
//   - країна — за центром клітинки в межах Natural Earth Admin 0, 1:10m, версія з погляду України (_ukr, Крим — Україна);
//   - для клітинок України region_id області за правилом CLAUDE.md: "Kyiv Oblast" → UKR-Kyiv, "Kyiv City" → UKR-Kyiv-City,
//     "Autonomous Republic of Crimea" → UKR-Crimea (межі областей — geoBoundaries ADM1, ті самі, що в fires);
//   - центр клітинки поза сушею (узбережжя, острівці) → найближча країна в межах 0,25°, інакше iso3 порожній.
// Клітинки беруться з частин світової сітки (data/grid_parts) і з сітки України (data/out/grid_monthly_UKR.csv).
// Запуск: node pipeline/06_cell_country.js        → pipeline/data/out/cell_country.csv (+ .gz) і звірка з Україною
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { cellCenter } = require('./lib');

const RAW = path.join(__dirname, 'data', 'raw');
const OUT = path.join(__dirname, 'data', 'out');
const PARTS = path.join(__dirname, 'data', 'grid_parts');
const NE_FILE = path.join(RAW, 'boundaries', 'ne_10m_admin_0_countries_ukr.geojson');
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ukr.geojson';
const UA_FILE = path.join(RAW, 'boundaries', 'ukr_adm1.geojson');
const SNAP = 0.25;

// ---------- геометрія ----------
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x, y, poly) {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}
function distToPoly2(x, y, poly, kx) { // квадрат відстані в «градусах широти» з поправкою довготи
  let best = Infinity;
  for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const x1 = ring[i - 1][0] * kx, y1 = ring[i - 1][1], x2 = ring[i][0] * kx, y2 = ring[i][1];
    const dx = x2 - x1, dy = y2 - y1, px = x * kx, py = y;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))) : 0;
    const ex = x1 + t * dx - px, ey = y1 + t * dy - py, d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return best;
}
// Індекс полігонів: кожна частина (outer + holes) у кошиках 1° × 1°
function buildIndex(items) { // items: [{key, poly}]
  const parts = [], buckets = new Map();
  for (const it of items) {
    let a = 180, b = 90, c = -180, d = -90;
    for (const [x, y] of it.poly[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
    const id = parts.push({ ...it, bbox: [a, b, c, d] }) - 1;
    for (let gx = Math.floor(a); gx <= Math.floor(c); gx++) for (let gy = Math.floor(b); gy <= Math.floor(d); gy++) {
      const k = gx + ':' + gy; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(id);
    }
  }
  return { parts, buckets };
}
function candidates(idx, x, y, r) {
  const ids = new Set();
  for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++) for (let gy = Math.floor(y - r); gy <= Math.floor(y + r); gy++)
    for (const id of idx.buckets.get(gx + ':' + gy) || []) ids.add(id);
  return [...ids].map(i => idx.parts[i]);
}
function locate(idx, x, y) {
  for (const p of candidates(idx, x, y, 0)) {
    const [a, b, c, d] = p.bbox;
    if (x >= a && x <= c && y >= b && y <= d && inPoly(x, y, p.poly)) return { key: p.key, snapped: false };
  }
  const kx = Math.cos((y * Math.PI) / 180);
  let best = null, bestD = SNAP * SNAP;
  for (const p of candidates(idx, x, y, SNAP / Math.max(kx, 0.1))) {
    const [a, b, c, d] = p.bbox;
    if (x < a - SNAP / Math.max(kx, 0.1) || x > c + SNAP / Math.max(kx, 0.1) || y < b - SNAP || y > d + SNAP) continue;
    const dd = distToPoly2(x, y, p.poly, kx);
    if (dd < bestD) { bestD = dd; best = p.key; }
  }
  return best ? { key: best, snapped: true } : null;
}
const polysOf = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// ---------- межі ----------
async function loadNE() {
  if (!fs.existsSync(NE_FILE)) {
    console.log('Завантажую Natural Earth…');
    fs.mkdirSync(path.dirname(NE_FILE), { recursive: true });
    fs.writeFileSync(NE_FILE, Buffer.from(await (await fetch(NE_URL)).arrayBuffer()));
  }
  const gj = JSON.parse(fs.readFileSync(NE_FILE, 'utf8'));
  const iso = p => [p.ISO_A3, p.ISO_A3_EH, p.ADM0_A3].find(v => /^[A-Z]{3}$/.test(v || ''));
  const items = [];
  for (const f of gj.features) for (const poly of polysOf(f.geometry)) items.push({ key: iso(f.properties), poly });
  return buildIndex(items);
}
const RENAME = { 'Odessa Oblast': 'Odesa Oblast', 'Zaporizhia Oblast': 'Zaporizhzhia Oblast', Kyiv: 'Kyiv City', Sevastopol: 'Sevastopol City' };
const regionId = name => 'UKR-' + name.replace(/ Oblast$/, '').replace(/^Autonomous Republic of /, '').replace(/ /g, '-');
function loadUA() {
  const gj = JSON.parse(fs.readFileSync(UA_FILE, 'utf8'));
  const items = [];
  for (const f of gj.features) {
    const name = RENAME[f.properties.shapeName] || f.properties.shapeName;
    for (const poly of polysOf(f.geometry)) items.push({ key: regionId(name), poly, city: /City$/.test(name) });
  }
  items.sort((a, b) => b.city - a.city); // Київ лежить усередині Київської області — міста першими
  return buildIndex(items);
}

// ---------- клітинки ----------
function readCells(file, set) {
  const t = file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)).toString() : fs.readFileSync(file, 'utf8');
  let n = 0;
  for (let i = 0; i < t.length;) {
    const j = t.indexOf(',', i), e = t.indexOf('\n', i);
    if (j < 0) break;
    const id = t.slice(i, j);
    if (/^-?\d/.test(id)) { set.add(id); n++; }
    i = e < 0 ? t.length : e + 1;
  }
  return n;
}

(async () => {
  const cells = new Set();
  const partFiles = fs.existsSync(PARTS) ? fs.readdirSync(PARTS).filter(f => f.endsWith('.csv')) : [];
  for (const f of partFiles) readCells(path.join(PARTS, f), cells);
  const uaGrid = path.join(OUT, 'grid_monthly_UKR.csv');
  const uaCells = new Set();
  if (fs.existsSync(uaGrid)) { readCells(uaGrid, uaCells); for (const c of uaCells) cells.add(c); }
  console.log(`Клітинок: ${cells.size} (частин світу: ${partFiles.length}, клітинок України: ${uaCells.size})`);

  const ne = await loadNE(), ua = loadUA();
  const rows = [], stats = { inside: 0, snapped: 0, none: 0, ukr: 0 };
  const result = new Map();
  for (const id of [...cells].sort()) {
    const [lat, lon] = cellCenter(id);
    let iso3 = '', region = '';
    const r = locate(ua, lon, lat);
    if (r && !r.snapped) { iso3 = 'UKR'; region = r.key; stats.inside++; }
    else {
      const c = locate(ne, lon, lat);
      if (c) { iso3 = c.key; c.snapped ? stats.snapped++ : stats.inside++; }
      else stats.none++;
      if (iso3 === 'UKR') region = r ? r.key : ''; // Natural Earth каже «Україна», а межа області трохи інша — найближча область
      else if (!iso3 && r) { iso3 = 'UKR'; region = r.key; stats.snapped++; stats.none--; }
    }
    if (iso3 === 'UKR') stats.ukr++;
    result.set(id, [iso3, region]);
    rows.push(`${id},${iso3},${region}`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const out = ['cell_id,iso3,region_id', ...rows].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'cell_country.csv'), out);
  fs.writeFileSync(path.join(OUT, 'cell_country.csv.gz'), zlib.gzipSync(out, { level: 9 }));
  const countries = new Set(rows.map(r => r.split(',')[1]).filter(Boolean));
  console.log(`Центр усередині країни: ${stats.inside}; найближча країна ≤0,25°: ${stats.snapped}; без країни (море): ${stats.none}`);
  console.log(`Країн: ${countries.size}; клітинок України: ${stats.ukr} → cell_country.csv (${(out.length / 1e6).toFixed(1)} МБ)`);

  // ---------- перевірка на Україні ----------
  if (uaCells.size) {
    const by = {}, bad = [];
    for (const id of uaCells) { const [iso] = result.get(id); by[iso || '(море)'] = (by[iso || '(море)'] || 0) + 1; if (iso !== 'UKR') bad.push(id + '→' + (iso || 'море')); }
    console.log(`\nПеревірка grid_monthly_UKR: ${uaCells.size} клітинок; iso3 = UKR: ${by.UKR || 0}`);
    if (bad.length) console.log('Інші коди (центр клітинки за кордоном/у морі, точки — з прикордонної смуги України):', JSON.stringify(by), '\n  приклади:', bad.slice(0, 8).join(', '));
    const noRegion = [...uaCells].filter(id => result.get(id)[0] === 'UKR' && !result.get(id)[1]).length;
    console.log(`Клітинок UKR без region_id: ${noRegion}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
