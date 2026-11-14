// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 2. Очищення точок MODIS + VIIRS і привʼязка до областей → data/out/fires.csv
// Формат (контракт v2): date,lat,lon,sensor,satellite,frp,confidence,cell_id,region
// Запуск: node pipeline/02_build_fires.js
const fs = require('fs');
const path = require('path');
const { satCode, cellId, confClass, DIR_SENSOR } = require('./lib');

const RAW = path.join(__dirname, 'data', 'raw');
const OUT = path.join(__dirname, 'data', 'out');      // локально, не в git: повний fires.csv
const SHARED = path.join(__dirname, '..', 'data');   // у git: малі похідні файли для команди
const FIRES_VERSION = 'v2';
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

// Confidence → спільна шкала: див. confClass у lib.js

// ---------- Читання CSV ----------
const stats = { read: 0, kept: 0, dropType: 0, dropBad: 0, dropNoRegion: 0, dropSat: 0, snapped: 0, byYear: {}, byConf: {}, byRegion: {} };
const rows = [];

function processDir(dir, sensor) {
  if (!fs.existsSync(path.join(RAW, dir))) return;
  const files = fs.readdirSync(path.join(RAW, dir)).filter(f => f.endsWith('.csv')).sort();
  for (const f of files) {
    SNAP_DEG = isApiFile(f) ? SNAP_DEG_API : SNAP_DEG_DEFAULT;
    const lines = fs.readFileSync(path.join(RAW, dir, f), 'utf8').split(/\r?\n/);
    const h = lines[0].split(',');
    const ix = n => h.indexOf(n);
    const I = { lat: ix('latitude'), lon: ix('longitude'), date: ix('acq_date'), frp: ix('frp'), conf: ix('confidence'), type: ix('type'), sat: ix('satellite') };
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const c = lines[i].split(',');
      stats.read++;
      // лише ймовірні пожежі рослинності: type=0 (1 вулкан, 2 статичне/промислове джерело, 3 офшор)
      if (I.type >= 0 && c[I.type] !== '0') { stats.dropType++; continue; }
      const lat = +c[I.lat], lon = +c[I.lon], date = c[I.date];
      if (!isFinite(lat) || !isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { stats.dropBad++; continue; }
      const satellite = satCode(c[I.sat]);
      if (!satellite) { stats.dropSat++; continue; }
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
      rows.push([date, +lat.toFixed(4) + '', +lon.toFixed(4) + '', sensor, satellite, frp, confidence, cellId(lat, lon), region]);
      stats.kept++;
      const y = date.slice(0, 4);
      const by = (stats.byYear[y] ||= {});
      by[satellite] = (by[satellite] || 0) + 1;
      stats.byConf[satellite + ':' + confidence] = (stats.byConf[satellite + ':' + confidence] || 0) + 1;
      stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
    }
    process.stdout.write(`  ${f}\n`);
  }
}

for (const dir of Object.keys(DIR_SENSOR)) { console.log(`Читаю ${dir}…`); processDir(dir, DIR_SENSOR[dir]); }

const SAT_ORDER = { Terra: 0, Aqua: 1, SNPP: 2, NOAA20: 3, NOAA21: 4 };
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : SAT_ORDER[a[4]] - SAT_ORDER[b[4]]));
const q = s => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const out = ['date,lat,lon,sensor,satellite,frp,confidence,cell_id,region', ...rows.map(r => r.map(q).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'fires.csv'), out);
// Повний fires.csv (~180 МБ) у git не кладемо. Стиснута копія (~28 МБ) більша за командний ліміт ~20 МБ,
// тому ділимо її на дві частини за роками; разом це та сама таблиця (заголовок у кожній частині).
const zlib = require('zlib');
const HEADER = 'date,lat,lon,sensor,satellite,frp,confidence,cell_id,region';
const PARTS = [['2000', '2015'], ['2016', '2026']];
for (const f of fs.readdirSync(SHARED)) if (/^fires_v\d+(_\d{4}-\d{4})?\.csv\.gz$/.test(f) && f.startsWith(`fires_${FIRES_VERSION}`)) fs.unlinkSync(path.join(SHARED, f));
const gzFiles = [];
for (const [a, b] of PARTS) {
  const part = rows.filter(r => r[0].slice(0, 4) >= a && r[0].slice(0, 4) <= b).map(r => r.map(q).join(','));
  const file = path.join(SHARED, `fires_${FIRES_VERSION}_${a}-${b}.csv.gz`);
  fs.writeFileSync(file, zlib.gzipSync([HEADER, ...part].join('\n') + '\n', { level: 9 }));
  gzFiles.push(file);
}
const GZ = gzFiles[0];

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
console.log(`Записано у fires.csv:   ${stats.kept}  (${(out.length / 1048576).toFixed(1)} MB)`);
for (const f of gzFiles) console.log(`  ${path.relative(path.join(__dirname, '..'), f)}: ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
const SATS = Object.keys(SAT_ORDER);
console.log('\nРік   ' + SATS.map(s => s.padStart(7)).join(' '));
for (const y of Object.keys(stats.byYear).sort()) console.log(`${y}  ` + SATS.map(s => String(stats.byYear[y][s] || '').padStart(7)).join(' '));
console.log('\nConfidence:', stats.byConf);
