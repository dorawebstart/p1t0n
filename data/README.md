# data/

Малі похідні файли даних. Сирі й великі файли — у спільній теці Google Drive (`raw/`, `processed/`), не в git.

Для кожного файла — рядок у таблиці. Формати описано в `CLAUDE.md`, розділ «Контракт даних».

| Файл | Хто створив | Яким скриптом | Вхідні дані (версія) | Дата |
|---|---|---|---|---|
| `fires_v1.csv.gz` | Дем'яненко Микола (data engineer) | `pipeline/02_build_fires.js` | NASA FIRMS: MODIS C6.1 MCD14ML і VIIRS S-NPP VNP14IMGML (Country Yearly Summary 2000–2025, SP), FIRMS Area API 2026 (SP + NRT); geoBoundaries UKR ADM1 | 14.11.2026 |
| `fires_v1_stats.json` | Дем'яненко Микола | `pipeline/02_build_fires.js` | те саме | 14.11.2026 |
| `regions.json` | Дем'яненко Микола | `pipeline/02_build_fires.js` | geoBoundaries UKR ADM1 (OSM, ODbL), build 12.12.2023 | 14.11.2026 |
| `regions.geojson` | Дем'яненко Микола | `pipeline/02_build_fires.js` | geoBoundaries UKR ADM1 (OSM, ODbL), build 12.12.2023 | 14.11.2026 |
