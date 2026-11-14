// Written with the assistance of Claude Code (AI); reviewed by the P1t0n captain.
// ФЕЙКОВІ дані для сайту у форматі контракту v2 (CLAUDE.md, «Контракт даних»).
// Потрібні, щоб фронтенд і дизайн працювали, поки немає справжньої гармонізації.
// Цифри вигадані (з правдоподібною сезонністю); межі областей — справжні (data/regions.geojson).
//
// Запуск:  node backend/make_fake_data.js
// Результат: frontend/public/data/  (перезаписується повністю)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'public', 'data');
const YEARS = { from: 2000, to: 2026, lastMonth2026: 10 };
const CELL = 0.25;

// ---------- Детермінований генератор випадкових чисел (однаковий результат щоразу) ----------
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261114);
const between = (a, b) => a + (b - a) * rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ---------- Зони ----------
// Правило id для областей: "UKR-" + назва без " Oblast" і без "Autonomous Republic of ", пробіли → "-"
const regionId = name => 'UKR-' + name.replace(/ Oblast$/, '').replace(/^Autonomous Republic of /, '').replace(/ /g, '-');

const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.geojson'), 'utf8'));
function bboxOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let b = [180, 90, -180, -90];
  for (const p of polys) for (const [x, y] of p[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b.map(v => +v.toFixed(3));
}
const oblasts = gj.features
  .map(f => ({ id: regionId(f.properties.region), name: f.properties.region, bbox: bboxOf(f.geometry) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const uaBbox = oblasts.reduce((b, o) => [Math.min(b[0], o.bbox[0]), Math.min(b[1], o.bbox[1]), Math.max(b[2], o.bbox[2]), Math.max(b[3], o.bbox[3])], [180, 90, -180, -90]);

// Кілька країн для демонстрації «весь світ» (межі приблизні, лише для фейку)
const countries = [
  { id: 'UKR', name: 'Ukraine', bbox: uaBbox, peak: [4, 8, 10], scale: 130000 },
  { id: 'POL', name: 'Poland', bbox: [14.1, 49.0, 24.2, 54.9], peak: [4, 8], scale: 15000 },
  { id: 'BRA', name: 'Brazil', bbox: [-74.0, -33.8, -34.8, 5.3], peak: [8, 9], scale: 1500000 },
  { id: 'AUS', name: 'Australia', bbox: [112.9, -43.7, 153.7, -10.6], peak: [10, 11, 12], scale: 900000 },
  { id: 'COD', name: 'DR Congo', bbox: [12.2, -13.5, 31.3, 5.4], peak: [6, 7, 8], scale: 2000000 },
];
const world = { id: 'WORLD', name: 'World', bbox: [-180, -90, 180, 90], peak: [8, 9], scale: 12000000 };

// ---------- Календар ----------
// Масштаб scale ≈ річна кількість точок × 1,6 (вигадані порядки величин).
// Сезонність: гаусові піки навколо заданих місяців + низький фон
function seasonal(month, peaks) {
  return 0.08 + peaks.reduce((s, p) => s + Math.exp(-(((month - p + 12) % 12 > 6 ? (month - p + 12) % 12 - 12 : (month - p + 12) % 12) ** 2) / 1.2), 0);
}
function median(xs) { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function makeCalendar(zone) {
  const yearFactor = {};
  for (let y = YEARS.from; y <= YEARS.to; y++) yearFactor[y] = between(0.5, 1.6) * (y === 2014 || y === 2015 ? 1.6 : 1); // «рекордні» роки
  const rows = [];
  for (let y = YEARS.from; y <= YEARS.to; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2000 && m < 11) continue;                      // Terra почав 01.11.2000
      if (y === YEARS.to && m > YEARS.lastMonth2026) continue;
      const harmonized = Math.round(zone.scale / 12 * seasonal(m, zone.peak) * yearFactor[y] * between(0.8, 1.2));
      const modis = Math.round(harmonized / between(3.2, 3.9));
      const viirs = y >= 2012 ? Math.round(harmonized * between(0.92, 1.08)) : null; // Suomi NPP з 2012
      rows.push({ region_id: zone.id, year: y, month: m, modis_count: modis, viirs_count: viirs, harmonized_count: harmonized });
    }
  }
  // медіана й z-score відносно того самого місяця за всі роки
  for (let m = 1; m <= 12; m++) {
    const ms = rows.filter(r => r.month === m);
    const med = median(ms.map(r => r.harmonized_count));
    const sd = Math.sqrt(ms.reduce((s, r) => s + (r.harmonized_count - med) ** 2, 0) / ms.length) || 1;
    for (const r of ms) { r.median_count = Math.round(med); r.anomaly = +((r.harmonized_count - med) / sd).toFixed(2); }
  }
  rows.sort((a, b) => a.year - b.year || a.month - b.month);
  return rows;
}

// ---------- Сітка (плитки 10° × 10°) ----------
const cellId = (lat, lon) => (Math.floor(lat / CELL) * CELL).toFixed(2) + '_' + (Math.floor(lon / CELL) * CELL).toFixed(2);
const tileOf = (lat, lon) => `${Math.floor(lat / 10) * 10}_${Math.floor(lon / 10) * 10}`;

function makeTile(tile, cellsBbox, peaks, nCells, scale) {
  const [lat10, lon10] = tile.split('_').map(Number);
  const [x0, y0, x1, y1] = [Math.max(cellsBbox[0], lon10), Math.max(cellsBbox[1], lat10), Math.min(cellsBbox[2], lon10 + 10), Math.min(cellsBbox[3], lat10 + 10)];
  if (x0 >= x1 || y0 >= y1) return [];
  const cells = new Set();
  for (let i = 0; i < nCells * 3 && cells.size < nCells; i++) cells.add(cellId(between(y0, y1), between(x0, x1)));
  const rows = [];
  for (const id of cells) {
    const w = between(0.2, 1.5);
    for (let y = 2001; y <= YEARS.to; y++) for (let m = 1; m <= 12; m++) {
      if (y === YEARS.to && m > YEARS.lastMonth2026) continue;
      const h = Math.round(scale * w * seasonal(m, peaks) * between(0, 1.4));
      if (h === 0) continue;                                    // нулі не пишемо
      rows.push({ cell_id: id, year: y, month: m, modis_count: Math.round(h / 3.5), viirs_count: y >= 2012 ? h : null, harmonized_count: h });
    }
  }
  return rows;
}

// ---------- Точки України ----------
function makeFires(month, n) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pts = [];
  // більше точок у «аграрних» областях — вигадана вага
  const weights = oblasts.map(o => (/Kherson|Mykolaiv|Odesa|Zaporizhzhia|Dnipropetrovsk|Kharkiv|Poltava|Kirovohrad/.test(o.name) ? 4 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    let r = rnd() * total, k = 0;
    while ((r -= weights[k]) > 0) k++;
    const o = oblasts[k];
    const sat = pick(['Terra', 'Aqua', 'SNPP', 'SNPP', 'SNPP', 'NOAA20', 'NOAA20', 'NOAA21']);
    pts.push({
      lat: +between(o.bbox[1], o.bbox[3]).toFixed(4),
      lon: +between(o.bbox[0], o.bbox[2]).toFixed(4),
      frp: +between(1, 60).toFixed(1),
      sensor: sat === 'Terra' || sat === 'Aqua' ? 'MODIS' : 'VIIRS',
      satellite: sat,
      date: `${month}-${String(1 + Math.floor(rnd() * days)).padStart(2, '0')}`,
      region_id: o.id,
    });
  }
  return pts.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- Запис ----------
fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, obj) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); return rel; };
const files = [];

files.push(write('regions.json', [world, ...countries, ...oblasts].map(({ id, name, bbox }) => ({ id, name, bbox }))));

for (const z of [world, ...countries]) files.push(write(`calendar/${z.id}.json`, makeCalendar(z)));
for (const o of oblasts) files.push(write(`calendar/${o.id}.json`, makeCalendar({ ...o, peak: [4, 8, 10], scale: between(2000, 20000) })));

// плитки: Україна + по одній на кожну демонстраційну країну
const tiles = {};
for (const lat of [40, 50]) for (const lon of [20, 30]) tiles[`${lat}_${lon}`] = { bbox: uaBbox, peaks: [4, 8, 10], n: 25, scale: 6 };
tiles[tileOf(-10, -55)] = { bbox: countries[2].bbox, peaks: [8, 9], n: 30, scale: 40 };
tiles[tileOf(-20, 135)] = { bbox: countries[3].bbox, peaks: [10, 11, 12], n: 30, scale: 30 };
tiles[tileOf(-5, 20)] = { bbox: countries[4].bbox, peaks: [6, 7, 8], n: 30, scale: 45 };
tiles[tileOf(52, 19)] = { bbox: countries[1].bbox, peaks: [4, 8], n: 15, scale: 3 };
for (const [t, c] of Object.entries(tiles)) {
  const rows = makeTile(t, c.bbox, c.peaks, c.n, c.scale);
  if (rows.length) files.push(write(`grid/${t}.json`, rows));
}

for (const [month, n] of [['2024-04', 400], ['2024-08', 900], ['2025-08', 700], ['2026-10', 300]]) files.push(write(`fires/UA/${month}.json`, makeFires(month, n)));

files.push(write('metrics.json', {
  fake: true,
  world: { mae: 0.21, r2: 0.83 },
  ukraine: { mae: 0.17, r2: 0.88 },
  viirs_reference: 'Suomi NPP (2012-2025); NOAA-20 bridged to Suomi NPP for 2026',
  notes: 'FAKE NUMBERS for UI development. Real metrics will replace this file.',
}));

write('manifest.json', { fake: true, generated_at: new Date().toISOString(), contract: 'v2', files: files.sort() });

const size = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`Записано ${files.length + 1} файлів, ${(size / 1048576).toFixed(1)} МБ → ${path.relative(ROOT, OUT)}`);
console.log(`Зон: ${1 + countries.length + oblasts.length}; плиток: ${files.filter(f => f.startsWith('grid/')).length}`);
