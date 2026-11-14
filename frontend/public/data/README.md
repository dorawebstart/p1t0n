# frontend/public/data — дані для сайту

> **Зараз тут ФЕЙКОВІ дані** (`manifest.json` → `"fake": true`). Цифри вигадані, межі областей справжні. Створено `node backend/make_fake_data.js`. Коли з'являться справжні дані, капітан замінить файли тим самим форматом — код фронтенду міняти не доведеться.
>
> Поки `fake: true`, сайт має показувати помітну плашку «Demo data».

Формат — контракт v2 у `CLAUDE.md`. Кожен файл = відповідь одного виклику API.

| Файл | Виклик API | Що всередині |
|---|---|---|
| `manifest.json` | — | `fake`, дата генерації, список усіх файлів |
| `regions.json` | `/api/regions` | `[{id, name, bbox:[minLon,minLat,maxLon,maxLat]}]`: `WORLD`, 5 країн, 27 областей України |
| `calendar/<region_id>.json` | `/api/calendar?region=` | рядки `{region_id, year, month, modis_count, viirs_count, harmonized_count, median_count, anomaly}`; `viirs_count = null` до 2012 |
| `grid/<tile>.json` | `/api/grid?tile=` | рядки `{cell_id, year, month, modis_count, viirs_count, harmonized_count}`; нулі не пишуться |
| `fires/UA/<YYYY-MM>.json` | `/api/fires?month=` | точки України `{lat, lon, frp, sensor, satellite, date, region_id}`; фільтр за областю — на боці сайту |
| `metrics.json` | `/api/metrics` | `{world:{mae,r2}, ukraine:{mae,r2}, viirs_reference, notes}` |

**Ідентифікатори зон:** `WORLD`; країни — ISO-3 (`UKR`, `POL`, `BRA`, `AUS`, `COD`); області — `UKR-` + назва без « Oblast», пробіли → `-`: `UKR-Kyiv`, `UKR-Kyiv-City`, `UKR-Crimea`, `UKR-Sevastopol-City`.

**Плитки:** `tile = "<lat10>_<lon10>"` — південно-західний кут квадрата 10° × 10°, напр. `40_30` (40–50° пн. ш., 30–40° сх. д.). Плитка точки: `Math.floor(lat/10)*10 + "_" + Math.floor(lon/10)*10`. Плитки, якої немає у файлах, означають «немає даних» — сайт має це витримати (404).

**Фейкові плитки:** 4 для України (`40_20`, `40_30`, `50_20`, `50_30`), Польща (`50_10`), Бразилія (`-10_-60`), ДР Конго (`-10_20`), Австралія (`-20_130`).

**Фейкові місяці точок:** `2024-04`, `2024-08`, `2025-08`, `2026-10`.
