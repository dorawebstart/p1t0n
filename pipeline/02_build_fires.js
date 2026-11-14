// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 2. Очищення точок MODIS + VIIRS і привʼязка до областей → data/out/fires.csv
// Формат (контракт команди): date,lat,lon,sensor,frp,confidence,region
// Запуск: node pipeline/02_build_fires.js
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'data', 'raw');
const OUT = path.join(__dirname, 'data', 'out');      // локально, не в git: fires.csv (~104 МБ)
const SHARED = path.join(__dirname, '..', 'data');   // у git: малі похідні файли для команди
const FIRES_VERSION = 'v1';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHARED, { recursive: true });

// ---------- Області ----------
// Назви geoBoundaries → узгоджені англійські назви (офіційна транслітерація)
const RENAME = {
  'Odessa Oblast': 'Odesa Oblast',
  'Zaporizhia Oblast': 'Zaporizhzhia Oblast',
  'Kyiv': 'Kyiv City',
  'Sevastopol': 'Sevastopol City',
};
const gj = JSON.parse(fs.readFileSync(path.join(RAW, 'boundaries', 'ukr_adm1.geojson'), 'utf8'));
const regions = gj.features.map(f => {
  const name = RENAME[f.properties.shapeName] || f.properties.shapeName;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { name, iso: f.properties.shapeISO, polys, bbox: [minX, minY, maxX, maxY] };
});
// Місто Київ лежить усередині Київської області — перевіряємо міста першими
regions.sort((a, b) => (a.name.endsWith('City') ? 0 : 1) - (b.name.endsWith('City') ? 0 : 1));

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
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false; // дірки
  return true;
}
function segDist2(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
  const px = x1 + t * dx - x, py = y1 + t * dy - y;
  return px * px + py * py;
}
const SNAP_DEG_DEFAULT = 0.05; // ~4–5 км: точки біля кордону/узбережжя, що випали за полігон
// Річні CSV FIRMS уже обрізані по Україні, тому «підтягувати» їх до області безпечно.
// Дані 2026 з API — це прямокутник із сусідніми країнами, тож для них допуск лише ~1 км.
const SNAP_DEG_API = 0.01;
const isApiFile = f => /_2026_/.test(f);
let SNAP_DEG = SNAP_DEG_DEFAULT;
function regionOf(lon, lat) {
  for (const r of regions) {
    const [a, b, c, d] = r.bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    for (const p of r.polys) if (inPoly(lon, lat, p)) return r.name;
  }
  // не всередині жодного полігону — шукаємо найближчу область у межах SNAP_DEG
  let best = null, bestD = SNAP_DEG * SNAP_DEG;
  const kx = Math.cos((lat * Math.PI) / 180); // довгота «коротша» на цій широті
  for (const r of regions) {
    const [a, b, c, d] = r.bbox;
    if (lon < a - SNAP_DEG / kx || lon > c + SNAP_DEG / kx || lat < b - SNAP_DEG || lat > d + SNAP_DEG) continue;
    for (const p of r.polys) for (const ring of p) for (let i = 1; i < ring.length; i++) {
      const p1 = [ring[i - 1][0] * kx, ring[i - 1][1]], p2 = [ring[i][0] * kx, ring[i][1]];
      const dd = segDist2(lon * kx, lat, p1, p2);
      if (dd < bestD) { bestD = dd; best = r.name; }
    }
  }
  return best;
}

// ---------- Confidence → спільна шкала ----------
// MODIS 0–100 → класи з MODIS C6 User Guide: <30 low, 30–79 nominal, ≥80 high
// VIIRS l/n/h → low/nominal/high
function confClass(sensor, v) {
  if (sensor === 'MODIS') { const n = +v; return n < 30 ? 'low' : n < 80 ? 'nominal' : 'high'; }
  return { l: 'low', n: 'nominal', h: 'high' }[v.trim().toLowerCase()] || 'unknown';
}

// ---------- Читання CSV ----------
const stats = { read: 0, kept: 0, dropType: 0, dropBad: 0, dropNoRegion: 0, snapped: 0, byYear: {}, byConf: {}, byRegion: {} };
const rows = [];

function processDir(dir, sensor) {
  const files = fs.readdirSync(path.join(RAW, dir)).filter(f => f.endsWith('.csv')).sort();
  for (const f of files) {
    SNAP_DEG = isApiFile(f) ? SNAP_DEG_API : SNAP_DEG_DEFAULT;
    const lines = fs.readFileSync(path.join(RAW, dir, f), 'utf8').split(/\r?\n/);
    const h = lines[0].split(',');
    const ix = n => h.indexOf(n);
    const I = { lat: ix('latitude'), lon: ix('longitude'), date: ix('acq_date'), frp: ix('frp'), conf: ix('confidence'), type: ix('type') };
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const c = lines[i].split(',');
      stats.read++;
      // лише ймовірні пожежі рослинності: type=0 (1 вулкан, 2 статичне/промислове джерело, 3 офшор)
      if (I.type >= 0 && c[I.type] !== '0') { stats.dropType++; continue; }
      const lat = +c[I.lat], lon = +c[I.lon], date = c[I.date];
      if (!isFinite(lat) || !isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { stats.dropBad++; continue; }
      let region = null;
      for (const r of regions) { // швидка перевірка «всередині»
        const [a, b, cc, d] = r.bbox;
        if (lon < a || lon > cc || lat < b || lat > d) continue;
        if (r.polys.some(p => inPoly(lon, lat, p))) { region = r.name; break; }
      }
      if (!region) { region = regionOf(lon, lat); if (region) stats.snapped++; }
      if (!region) { stats.dropNoRegion++; continue; }
      const confidence = confClass(sensor, c[I.conf]);
      const frp = c[I.frp] === '' ? '' : (+c[I.frp]).toString();
      // 4 знаки ≈ 11 м — значно точніше за піксель (375 м / 1 км), а файл менший
      rows.push([date, +lat.toFixed(4) + '', +lon.toFixed(4) + '', sensor, frp, confidence, region]);
      stats.kept++;
      const y = date.slice(0, 4);
      (stats.byYear[y] ||= { MODIS: 0, VIIRS: 0 })[sensor]++;
      stats.byConf[sensor + ':' + confidence] = (stats.byConf[sensor + ':' + confidence] || 0) + 1;
      stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
    }
    process.stdout.write(`  ${f}\n`);
  }
}

console.log('Читаю MODIS…'); processDir('modis', 'MODIS');
console.log('Читаю VIIRS S-NPP…'); processDir('viirs-snpp', 'VIIRS');

rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0));
const q = s => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const out = ['date,lat,lon,sensor,frp,confidence,region', ...rows.map(r => r.map(q).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'fires.csv'), out);
// fires.csv > 100 MB не пройде в GitHub — у репозиторій кладемо стиснуту копію (~18 МБ)
const GZ = path.join(SHARED, `fires_${FIRES_VERSION}.csv.gz`);
fs.writeFileSync(GZ, require('zlib').gzipSync(out, { level: 9 }));

// Довідкові файли для бекенду/фронтенду
const names = regions.map(r => r.name).sort();
fs.writeFileSync(path.join(SHARED, 'regions.json'), JSON.stringify(names, null, 2) + '\n');
const gjOut = { type: 'FeatureCollection', features: gj.features.map(f => ({ type: 'Feature', properties: { region: RENAME[f.properties.shapeName] || f.properties.shapeName, iso: f.properties.shapeISO }, geometry: f.geometry })) };
fs.writeFileSync(path.join(SHARED, 'regions.geojson'), JSON.stringify(gjOut));
fs.writeFileSync(path.join(SHARED, `fires_${FIRES_VERSION}_stats.json`), JSON.stringify(stats, null, 2) + '\n');

console.log(`\nПрочитано точок:        ${stats.read}`);
console.log(`Відкинуто type≠0:       ${stats.dropType}`);
console.log(`Відкинуто зіпсованих:   ${stats.dropBad}`);
console.log(`Поза областями:         ${stats.dropNoRegion}  (сусідні країни з API-прямокутника 2026)`);
console.log(`Привʼязано до найближчої області: ${stats.snapped}  (≤5 км для річних CSV, ≤1 км для 2026)`);
console.log(`Записано у fires.csv:   ${stats.kept}  (${(out.length / 1048576).toFixed(1)} MB; ${path.relative(path.join(__dirname, '..'), GZ)}: ${(fs.statSync(GZ).size / 1048576).toFixed(1)} MB)`);
console.log('\nРік   MODIS   VIIRS');
for (const y of Object.keys(stats.byYear).sort()) console.log(`${y}  ${String(stats.byYear[y].MODIS).padStart(6)}  ${String(stats.byYear[y].VIIRS).padStart(6)}`);
console.log('\nConfidence:', stats.byConf);
