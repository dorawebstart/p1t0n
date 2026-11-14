// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Спільні правила pipeline (контракт даних v2 у CLAUDE.md): супутник, клітинка сітки, confidence.

// Код супутника у FIRMS → значення колонки `satellite` контракту
const SAT = { Terra: 'Terra', T: 'Terra', Aqua: 'Aqua', A: 'Aqua', N: 'SNPP', N20: 'NOAA20', N21: 'NOAA21' };
function satCode(v) { return SAT[(v || '').trim()] || null; }

// Клітинка 0,25°: cell_id = "<lat>_<lon>" південно-західного кута, два знаки після коми
const CELL = 0.25;
function cellCorner(v) { return Math.floor(v / CELL + 1e-9) * CELL; }
function cellId(lat, lon) { return cellCorner(lat).toFixed(2) + '_' + cellCorner(lon).toFixed(2); }
// Центр клітинки за її id (для колонок lat/lon у grid_monthly)
function cellCenter(id) { const [a, b] = id.split('_').map(Number); return [+(a + CELL / 2).toFixed(3), +(b + CELL / 2).toFixed(3)]; }

// MODIS 0–100 → класи з MODIS C6 User Guide: <30 low, 30–79 nominal, ≥80 high; VIIRS l/n/h
function confClass(sensor, v) {
  if (sensor === 'MODIS') { const n = +v; return n < 30 ? 'low' : n < 80 ? 'nominal' : 'high'; }
  return { l: 'low', n: 'nominal', h: 'high' }[String(v).trim().toLowerCase()] || 'unknown';
}

// Підпапки data/raw → сенсор контракту
const DIR_SENSOR = { modis: 'MODIS', 'viirs-snpp': 'VIIRS', 'viirs-jpss1': 'VIIRS', 'viirs-jpss2': 'VIIRS' };

module.exports = { satCode, cellId, cellCenter, confClass, DIR_SENSOR, CELL };
