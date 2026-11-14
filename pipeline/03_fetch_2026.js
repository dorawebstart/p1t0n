// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 1б. Дані за 2026 рік через FIRMS Area API (у річних CSV 2026 ще немає).
// Пише data/raw/modis/modis_2026_Ukraine.csv, data/raw/viirs-snpp/viirs-snpp_2026_Ukraine.csv
// і data/raw/viirs-jpss1/viirs-jpss1_2026_Ukraine.csv
// у тому самому форматі, що й річні файли, тож 02_build_fires.js підхоплює їх без змін.
//
// Запуск (ключ не зберігається у файлах):
//   PowerShell:  $env:FIRMS_MAP_KEY="ваш_ключ"; node pipeline/03_fetch_2026.js
//   bash:        FIRMS_MAP_KEY=ваш_ключ node pipeline/03_fetch_2026.js
// Потім:         node pipeline/02_build_fires.js
//
// Логіка:
//  - для кожного сенсора беремо Standard Processing (SP), поки він є, а далі NRT;
//  - Suomi NPP закінчується 02.11.2026 (сенсор вимкнено);
//  - у NRT немає поля `type`, тому промислові джерела позначаємо за історичною «маскою»:
//    клітинки ~1 км, де у 2000–2025 траплялися точки type=2, отримують type=2.
const fs = require('fs');
const path = require('path');

// Ключ: змінна середовища, аргумент або файл .env у корені репозиторію (він у .gitignore)
function keyFromDotEnv() {
  try {
    const t = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = /^\s*FIRMS_MAP_KEY\s*=\s*"?([^"\r\n#]+)"?/m.exec(t);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const KEY = process.env.FIRMS_MAP_KEY || process.argv[2] || keyFromDotEnv();
const RAW = path.join(__dirname, 'data', 'raw');
const CACHE = path.join(RAW, 'api2026');
const BBOX = '22,44,40.3,52.4'; // прямокутник України; зайве відсіче привʼязка до областей
const YEAR_START = '2026-01-01';
const TODAY = new Date().toISOString().slice(0, 10);
const SNPP_END = '2026-11-02';
const BASE = 'https://firms.modaps.eosdis.nasa.gov/api';

if (!KEY) {
  console.log('Потрібен MAP_KEY FIRMS (безкоштовно: https://firms.modaps.eosdis.nasa.gov/api/map_key/)');
  console.log('Впишіть його у файл .env у корені репозиторію (зразок: .env.example) або:');
  console.log('PowerShell:  $env:FIRMS_MAP_KEY="ваш_ключ"; node pipeline/03_fetch_2026.js');
  process.exit(1);
}

const SENSORS = [
  { name: 'MODIS', sp: 'MODIS_SP', nrt: 'MODIS_NRT', end: TODAY, dir: 'modis', file: 'modis_2026_Ukraine.csv',
    header: 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type' },
  { name: 'VIIRS', sp: 'VIIRS_SNPP_SP', nrt: 'VIIRS_SNPP_NRT', end: SNPP_END < TODAY ? SNPP_END : TODAY, dir: 'viirs-snpp', file: 'viirs-snpp_2026_Ukraine.csv',
    header: 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type' },
  // NOAA-20 — замінник Suomi NPP; потрібен, щоб ряд тривав після 02.11.2026
  { name: 'VIIRS NOAA-20', sp: 'VIIRS_NOAA20_SP', nrt: 'VIIRS_NOAA20_NRT', end: TODAY, dir: 'viirs-jpss1', file: 'viirs-jpss1_2026_Ukraine.csv',
    header: 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type' },
];

const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mask = s => s.replace(KEY, '***');

async function getText(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url);
      const t = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`);
      if (/invalid|error/i.test(t.slice(0, 200)) && !t.startsWith('latitude') && !t.startsWith('data_id')) throw new Error(t.slice(0, 200));
      return t;
    } catch (e) {
      if (i === tries) throw new Error(mask(e.message));
      await sleep(3000 * i);
    }
  }
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines[0] || !lines[0].startsWith('latitude')) return { header: [], rows: [] };
  return { header: lines[0].split(','), rows: lines.slice(1).filter(Boolean).map(l => l.split(',')) };
}

// --- Маска статичних джерел з історії (type=2) ---
function buildStaticMask() {
  const cells = new Set();
  for (const dir of ['modis', 'viirs-snpp', 'viirs-jpss1']) {
    if (!fs.existsSync(path.join(RAW, dir))) continue;
    for (const f of fs.readdirSync(path.join(RAW, dir)).filter(f => f.endsWith('.csv') && !f.includes('2026'))) {
      const lines = fs.readFileSync(path.join(RAW, dir, f), 'utf8').split(/\r?\n/);
      const h = lines[0].split(','), iLat = h.indexOf('latitude'), iLon = h.indexOf('longitude'), iT = h.indexOf('type');
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',');
        if (c[iT] === '2') cells.add(Math.floor(+c[iLat] * 100) + ':' + Math.floor(+c[iLon] * 100));
      }
    }
  }
  return cells;
}
function isStatic(cells, lat, lon) {
  const a = Math.floor(lat * 100), b = Math.floor(lon * 100);
  for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) if (cells.has(a + da + ':' + (b + db))) return true;
  return false;
}

(async () => {
  fs.mkdirSync(CACHE, { recursive: true });
  console.log('Перевіряю доступні дати…');
  const avail = {};
  const av = await getText(`${BASE}/data_availability/csv/${KEY}/ALL`);
  for (const l of av.trim().split(/\r?\n/).slice(1)) { const [id, min, max] = l.split(','); avail[id] = { min, max }; }

  console.log('Будую маску промислових джерел з даних 2000–2025…');
  const cells = buildStaticMask();
  console.log(`  клітинок ~1 км з type=2: ${cells.size}`);

  for (const s of SENSORS) {
    const spMax = avail[s.sp] && avail[s.sp].max >= YEAR_START ? avail[s.sp].max : null;
    const plan = [];
    if (spMax) plan.push({ src: s.sp, from: YEAR_START, to: spMax < s.end ? spMax : s.end });
    let nrtFrom = spMax ? addDays(spMax, 1) : YEAR_START;
    // не просимо NRT раніше, ніж FIRMS його зберігає
    const nrtMin = avail[s.nrt] && avail[s.nrt].min;
    if (nrtMin && nrtMin > nrtFrom) { console.log(`  ${s.nrt} доступний лише з ${nrtMin}`); nrtFrom = nrtMin; }
    if (nrtFrom <= s.end) plan.push({ src: s.nrt, from: nrtFrom, to: s.end });
    console.log(`\n${s.name}: ` + plan.map(p => `${p.src} ${p.from}…${p.to}`).join(' + '));

    const outHeader = s.header.split(',');
    const out = [];
    let nStatic = 0, nReq = 0;
    for (const p of plan) {
      for (let d = p.from; d <= p.to; d = addDays(d, 5)) {
        const span = Math.min(5, Math.round((new Date(p.to) - new Date(d)) / 864e5) + 1);
        const cacheFile = path.join(CACHE, `${p.src}_${d}_${span}.csv`);
        let text;
        // кешуємо лише закриті періоди (не останні 5 днів — вони ще доповнюються)
        if (fs.existsSync(cacheFile)) text = fs.readFileSync(cacheFile, 'utf8');
        else {
          text = await getText(`${BASE}/area/csv/${KEY}/${p.src}/${BBOX}/${span}/${d}`);
          nReq++;
          if (addDays(d, span + 5) <= TODAY) fs.writeFileSync(cacheFile, text);
          await sleep(300);
        }
        const { header, rows } = parseCsv(text);
        const idx = outHeader.map(n => header.indexOf(n === 'bright_ti4' && header.indexOf(n) < 0 ? 'brightness' : n === 'bright_ti5' && header.indexOf(n) < 0 ? 'bright_t31' : n));
        const iLat = header.indexOf('latitude'), iLon = header.indexOf('longitude'), iT = header.indexOf('type');
        for (const c of rows) {
          let type = iT >= 0 && c[iT] !== '' ? c[iT] : null;
          if (type === null) { type = isStatic(cells, +c[iLat], +c[iLon]) ? '2' : '0'; if (type === '2') nStatic++; }
          out.push(outHeader.map((n, k) => (n === 'type' ? type : idx[k] >= 0 ? c[idx[k]] : '')).join(','));
        }
        process.stdout.write(`\r  ${p.src} ${d}  точок: ${out.length}   `);
      }
    }
    const file = path.join(RAW, s.dir, s.file);
    fs.writeFileSync(file, [s.header, ...out].join('\n') + '\n');
    console.log(`\n  → ${path.relative(RAW, file)}: ${out.length} точок (запитів до API: ${nReq}; NRT позначено як статичні: ${nStatic})`);
  }
  console.log('\nГотово. Тепер: node pipeline/02_build_fires.js');
})().catch(e => { console.error('\nПОМИЛКА:', mask(e.message)); process.exit(1); });
