// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 5. Агрегація точок FIRMS у місячну сітку 0,25° (контракт v2, таблиця grid_monthly):
//   cell_id, lat, lon, year, month, sensor, satellite, count, frp_sum
// Лише type = 0 (пожежі рослинності). Рядки з count = 0 не пишуться. lat/lon — центр клітинки.
//
// Режими:
//   node pipeline/05_grid_monthly.js ukraine      — з річних CSV України (data/raw/<sensor>/) → data/out/grid_monthly_UKR.csv
//   node pipeline/05_grid_monthly.js world        — кожен архів data/raw/world/*.zip → data/grid_parts/<архів>.csv
//                                                   (вже оброблені пропускаються; можна запускати, поки йде завантаження)
//   node pipeline/05_grid_monthly.js merge        — склеїти частини → data/out/grid_monthly_v1.csv (+ .gz)
//   node pipeline/05_grid_monthly.js watch [N]    — world кожні 2 хв, доки не оброблено N архівів (48), потім merge
// Архіви читаються потоком (zip → inflate → рядки), сирі точки на диск не розпаковуються й у пам'яті не тримаються.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { satCode, cellId, cellCenter, DIR_SENSOR } = require('./lib');

const RAW = path.join(__dirname, 'data', 'raw');
const OUT = path.join(__dirname, 'data', 'out');
const PARTS = path.join(__dirname, 'data', 'grid_parts');
const HEADER = 'cell_id,lat,lon,year,month,sensor,satellite,count,frp_sum';
const SENSOR_OF_SAT = { Terra: 'MODIS', Aqua: 'MODIS', SNPP: 'VIIRS', NOAA20: 'VIIRS', NOAA21: 'VIIRS' };

// ---------- агрегатор ----------
function newAgg() { return { cells: new Map(), read: 0, kept: 0, dropType: 0, dropBad: 0 }; }
function makeLineHandler(agg) {
  let I = null;
  return line => {
    if (!line) return;
    if (I === null || line.startsWith('latitude,')) { // заголовок (у кожному файлі свій)
      const h = line.split(',');
      I = { lat: h.indexOf('latitude'), lon: h.indexOf('longitude'), date: h.indexOf('acq_date'), sat: h.indexOf('satellite'), frp: h.indexOf('frp'), type: h.indexOf('type') };
      return;
    }
    const c = line.split(',');
    agg.read++;
    if (I.type >= 0 && c[I.type] !== '0') { agg.dropType++; return; }
    const lat = +c[I.lat], lon = +c[I.lon], d = c[I.date], sat = satCode(c[I.sat]);
    if (!isFinite(lat) || !isFinite(lon) || !sat || !/^\d{4}-\d{2}/.test(d)) { agg.dropBad++; return; }
    const key = cellId(lat, lon) + '|' + d.slice(0, 4) + '|' + (+d.slice(5, 7)) + '|' + sat;
    const frp = +c[I.frp] || 0;
    const v = agg.cells.get(key);
    if (v) { v[0]++; v[1] += frp; } else agg.cells.set(key, [1, frp]);
    agg.kept++;
  };
}
function aggToLines(agg) {
  const out = [];
  for (const [key, [n, frp]] of agg.cells) {
    const [cell, y, m, sat] = key.split('|');
    const [clat, clon] = cellCenter(cell);
    out.push(`${cell},${clat},${clon},${y},${m},${SENSOR_OF_SAT[sat]},${sat},${n},${frp.toFixed(1)}`);
  }
  return out.sort();
}

// ---------- читання zip потоком ----------
function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(size, 65557));
  fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('не zip: ' + file);
  const count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOff);
  const list = [];
  for (let p = 0, i = 0; i < count; i++) {
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32), lho = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || !name.endsWith('.csv')) continue;
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, lho);
    const start = lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    list.push({ name, method, csize, usize, start });
  }
  fs.closeSync(fd);
  return list;
}
async function streamLines(stream, onLine) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) onLine(line);
}
async function aggregateZip(file) {
  const agg = newAgg();
  for (const e of zipEntries(file)) {
    if (e.csize === 0) continue;
    const raw = fs.createReadStream(file, { start: e.start, end: e.start + e.csize - 1 });
    const stream = e.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
    await streamLines(stream, makeLineHandler(agg)); // свій заголовок у кожному файлі країни
  }
  return agg;
}

// ---------- режими ----------
async function modeUkraine() {
  const agg = newAgg();
  for (const dir of Object.keys(DIR_SENSOR)) {
    const d = path.join(RAW, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(f => f.endsWith('.csv')).sort()) {
      if (/_2026_/.test(f)) continue; // 2026 з API — прямокутник із сусідами; для перевірки беремо лише річні CSV країни
      await streamLines(fs.createReadStream(path.join(d, f)), makeLineHandler(agg));
    }
  }
  const lines = aggToLines(agg);
  fs.mkdirSync(OUT, { recursive: true });
  const ukr = [HEADER, ...lines].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'grid_monthly_UKR.csv'), ukr);
  // мала копія для команди в git: сітка лише України (річні CSV країни, без 2026)
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'grid_monthly_UKR_v1.csv.gz'), zlib.gzipSync(ukr, { level: 9 }));
  console.log(`Україна: прочитано ${agg.read}, type≠0 ${agg.dropType}, зіпсованих ${agg.dropBad}, у сітці ${agg.kept} точок → ${lines.length} рядків`);
  // звірка з fires_v2 (той самий фільтр; для 2000–2025 fires не відкидає жодної точки річних CSV)
  const firesFile = path.join(OUT, 'fires.csv');
  if (fs.existsSync(firesFile)) {
    const bySat = {}, byGrid = {};
    await streamLines(fs.createReadStream(firesFile), l => {
      const c = l.split(','); if (c[0] === 'date' || c[0] >= '2026') return;
      const k = c[0].slice(0, 4) + ' ' + c[4]; bySat[k] = (bySat[k] || 0) + 1;
    });
    for (const l of lines) { const c = l.split(','); const k = c[3] + ' ' + c[6]; byGrid[k] = (byGrid[k] || 0) + +c[7]; }
    const keys = [...new Set([...Object.keys(bySat), ...Object.keys(byGrid)])].sort();
    const diff = keys.filter(k => bySat[k] !== byGrid[k]);
    console.log(diff.length ? 'РОЗБІЖНОСТІ (рік супутник: fires / grid):\n' + diff.map(k => `  ${k}: ${bySat[k]} / ${byGrid[k]}`).join('\n')
      : `Звірка з fires.csv: усі ${keys.length} пар «рік × супутник» збігаються ✔`);
  }
}

async function modeWorld() {
  const dir = path.join(RAW, 'world');
  fs.mkdirSync(PARTS, { recursive: true });
  const zips = fs.readdirSync(dir).filter(f => f.endsWith('.zip')).sort();
  for (const z of zips) {
    const part = path.join(PARTS, z.replace(/\.zip$/, '.csv'));
    if (fs.existsSync(part)) continue;
    const t0 = Date.now();
    const agg = await aggregateZip(path.join(dir, z));
    const lines = aggToLines(agg);
    fs.writeFileSync(part + '.tmp', lines.join('\n') + '\n');
    fs.renameSync(part + '.tmp', part);
    fs.writeFileSync(part.replace(/\.csv$/, '.stats.json'), JSON.stringify({ read: agg.read, kept: agg.kept, dropType: agg.dropType, dropBad: agg.dropBad, rows: lines.length }) + '\n');
    console.log(`${z}: ${agg.read} точок, type=0 ${agg.kept}, → ${lines.length} рядків (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  }
}

async function modeMerge() {
  const parts = fs.readdirSync(PARTS).filter(f => f.endsWith('.csv')).sort();
  const outFile = path.join(OUT, 'grid_monthly_v1.csv');
  const w = fs.createWriteStream(outFile);
  w.write(HEADER + '\n');
  let rows = 0, points = 0;
  for (const p of parts) {
    const t = fs.readFileSync(path.join(PARTS, p), 'utf8');
    for (const l of t.split('\n')) if (l) { rows++; points += +l.split(',')[7]; }
    w.write(t);
  }
  await new Promise(r => w.end(r));
  await new Promise((res, rej) => fs.createReadStream(outFile).pipe(zlib.createGzip({ level: 9 })).pipe(fs.createWriteStream(outFile + '.gz')).on('finish', res).on('error', rej));
  console.log(`grid_monthly_v1: ${parts.length} архівів, ${rows} рядків, ${points} точок; ${(fs.statSync(outFile).size / 1e6).toFixed(0)} МБ, .gz ${(fs.statSync(outFile + '.gz').size / 1e6).toFixed(0)} МБ`);
}

// watch: повторює world кожні 2 хв, доки не будуть оброблені всі N архівів (за замовчуванням 48), потім merge
async function modeWatch() {
  const N = +(process.argv[3] || 48);
  for (;;) {
    await modeWorld();
    const done = fs.readdirSync(PARTS).filter(f => f.endsWith('.csv')).length;
    if (done >= N) break;
    await new Promise(r => setTimeout(r, 120000));
  }
  await modeMerge();
}

const mode = process.argv[2];
({ ukraine: modeUkraine, world: modeWorld, merge: modeMerge, watch: modeWatch }[mode] || (() => { console.log('Режим: ukraine | world | merge'); process.exitCode = 1; }))()
  .catch(e => { console.error(e); process.exit(1); });
