// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 4. Архіви світу FIRMS «Country Yearly Summary» (Standard Processing), по одному zip на рік і сенсор.
// Порядок завантаження: modis → viirs-snpp (еталон) → viirs-jpss1 (місток NOAA-20).
// Разом ≈ 10 ГБ. Вже завантажені файли пропускаються (розмір звіряється зі списком FIRMS).
// Запуск: node pipeline/04_download_world.js [modis|viirs-snpp|viirs-jpss1 ...]
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const DIR = path.join(__dirname, 'data', 'raw', 'world');
const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/country';
const ORDER = process.argv.slice(2).length ? process.argv.slice(2) : ['modis', 'viirs-snpp', 'viirs-jpss1'];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const list = await (await fetch(`${BASE}/yearly_summary_files.txt`)).text();
  const files = list.split(/\r?\n/).map(l => l.split(',')).filter(c => /_all_countries\.zip$/.test(c[0]))
    .map(c => ({ name: c[0], size: +c[1], sensor: c[0].replace(/_\d{4}_all_countries\.zip$/, '') }))
    .filter(f => ORDER.includes(f.sensor))
    .sort((a, b) => ORDER.indexOf(a.sensor) - ORDER.indexOf(b.sensor) || a.name.localeCompare(b.name));
  if (process.env.REVERSE) files.reverse(); // другий паралельний потік іде з кінця списку
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`${files.length} архівів, ${(total / 1e9).toFixed(1)} ГБ`);
  let done = 0;
  for (const f of files) {
    const out = path.join(DIR, f.name);
    if (fs.existsSync(out) && fs.statSync(out).size === f.size) { done += f.size; console.log(`skip ${f.name}`); continue; }
    // інший потік уже качає цей файл (його .part оновлювався протягом останньої хвилини)
    if (fs.existsSync(out + '.part') && Date.now() - fs.statSync(out + '.part').mtimeMs < 60000) { console.log(`busy ${f.name}`); continue; }
    for (let attempt = 1; ; attempt++) {
      try {
        const t0 = Date.now();
        const r = await fetch(`${BASE}/zips/${f.name}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(out + '.part'));
        const got = fs.statSync(out + '.part').size;
        if (got !== f.size) throw new Error(`розмір ${got} ≠ ${f.size}`);
        fs.renameSync(out + '.part', out);
        done += f.size;
        const mbps = (f.size / 1e6) / ((Date.now() - t0) / 1000);
        console.log(`ok   ${f.name}  ${(f.size / 1e6).toFixed(0)} МБ  ${mbps.toFixed(1)} МБ/с  [${(100 * done / total).toFixed(0)}%]`);
        break;
      } catch (e) {
        console.log(`fail ${f.name}: ${e.message} (спроба ${attempt})`);
        if (attempt >= 5) { console.log(`ПРОПУЩЕНО ${f.name}`); break; }
        await new Promise(res => setTimeout(res, 5000 * attempt));
      }
    }
  }
  console.log('Завантаження завершено.');
})();
