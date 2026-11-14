// Written with the assistance of Claude Code (AI); reviewed and run by the P1t0n data engineer.
// Крок 1. Завантаження сирих даних.
// MODIS (Terra+Aqua, C6.1, Standard Processing) 2000–2025 і VIIRS S-NPP 375 m (SP) 2012–2025
// з NASA FIRMS «Country Yearly Summary», плюс кордони областей України (geoBoundaries ADM1).
// Запуск: node pipeline/01_download.js   (вже завантажені файли пропускаються)
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'data', 'raw');
const LAST_YEAR = 2025; // 2026 у річних CSV ще немає — береться через API (див. README)

const jobs = [];
for (let y = 2000; y <= LAST_YEAR; y++)
  jobs.push({ url: `https://firms.modaps.eosdis.nasa.gov/data/country/modis/${y}/modis_${y}_Ukraine.csv`, out: path.join(RAW, 'modis', `modis_${y}_Ukraine.csv`) });
for (let y = 2012; y <= LAST_YEAR; y++)
  jobs.push({ url: `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/${y}/viirs-snpp_${y}_Ukraine.csv`, out: path.join(RAW, 'viirs-snpp', `viirs-snpp_${y}_Ukraine.csv`) });
for (let y = 2018; y <= LAST_YEAR; y++) // NOAA-20 — місток до Suomi NPP (контракт v2)
  jobs.push({ url: `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/${y}/viirs-jpss1_${y}_Ukraine.csv`, out: path.join(RAW, 'viirs-jpss1', `viirs-jpss1_${y}_Ukraine.csv`) });
jobs.push({ url: 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/UKR/ADM1/geoBoundaries-UKR-ADM1.geojson', out: path.join(RAW, 'boundaries', 'ukr_adm1.geojson') });

async function get(job, tries = 3) {
  if (fs.existsSync(job.out) && fs.statSync(job.out).size > 0) return 'skip';
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(job.url, { redirect: 'follow' });
      if (r.status === 404) return '404';
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(job.out), { recursive: true });
      fs.writeFileSync(job.out + '.part', buf);
      fs.renameSync(job.out + '.part', job.out);
      return (buf.length / 1048576).toFixed(1) + ' MB';
    } catch (e) {
      if (i === tries) return 'ERROR ' + e.message;
      await new Promise(res => setTimeout(res, 2000 * i));
    }
  }
}

(async () => {
  let failed = 0;
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      const j = queue.shift();
      const res = await get(j);
      if (res.startsWith('ERROR') || res === '404') failed++;
      console.log(`${res.padEnd(10)} ${path.relative(RAW, j.out)}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(failed ? `\nНе вдалося: ${failed}` : '\nУсе завантажено.');
  process.exitCode = failed ? 1 : 0;
})();
