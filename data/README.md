# data/

Малі похідні файли даних. Сирі й великі файли — у спільній теці Google Drive (`raw/`, `processed/`), не в git.

Для кожного файла — рядок у таблиці. Формати описано в `CLAUDE.md`, розділ «Контракт даних».

| Файл | Хто створив | Яким скриптом | Вхідні дані (версія) | Дата |
|---|---|---|---|---|
| `fires_v2_2000-2015.csv.gz`, `fires_v2_2016-2026.csv.gz` (дві частини однієї таблиці) | Дем'яненко Микола (data engineer) | `pipeline/02_build_fires.js` | NASA FIRMS Country Yearly Summary (SP) 2000–2025: MODIS C6.1 MCD14ML, VIIRS VNP14IMGML (Suomi NPP), VJ114IMGML (NOAA-20); FIRMS Area API 2026 (SP + NRT, вкл. NOAA-21); geoBoundaries UKR ADM1 | 14.11.2026 |
| `fires_v2_stats.json` | Дем'яненко Микола | `pipeline/02_build_fires.js` | те саме | 14.11.2026 |
| `grid_monthly_UKR_v1.csv.gz` | Дем'яненко Микола | `pipeline/05_grid_monthly.js ukraine` | річні CSV FIRMS по Україні 2000–2025 (без 2026) | 14.11.2026 |
| Drive: `processed/grid_monthly_v1.csv.gz` (світ) | Дем'яненко Микола | `pipeline/04_download_world.js` + `pipeline/05_grid_monthly.js watch` | FIRMS `<sensor>_<year>_all_countries.zip` (SP): modis 2000–2025, viirs-snpp 2012–2025, viirs-jpss1 2018–2025 | у роботі — посилання: TODO після заливки |
| Drive: `processed/cell_country.csv` (`cell_id, iso3, region_id`) | Дем'яненко Микола | `pipeline/06_cell_country.js` | клітинки `grid_monthly` (світ + Україна); Natural Earth Admin 0 1:10m POV Ukraine 5.2.0-pre (public domain); geoBoundaries UKR ADM1 | у роботі — посилання: TODO після заливки |
| `regions.json` | Дем'яненко Микола | `pipeline/02_build_fires.js` | geoBoundaries UKR ADM1 (OSM, ODbL), build 12.12.2023 | 14.11.2026 |
| `regions.geojson` | Дем'яненко Микола | `pipeline/02_build_fires.js` | geoBoundaries UKR ADM1 (OSM, ODbL), build 12.12.2023 | 14.11.2026 |
