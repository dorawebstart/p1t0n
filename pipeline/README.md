# pipeline/

Власник: data engineer. Будує дві таблиці контракту v2 (див. `CLAUDE.md`, розділ «Контракт даних»):

- **`fires`** — окремі точки активних пожеж по Україні;
- **`grid_monthly`** — кількість точок у клітинках 0,25° за місяць і супутник, для всього світу.

Працюйте у своїй гілці, у `main` — через Pull Request. Правила: `docs/TEAM_WORKFLOW.md`.

> Parts of the code in this folder were written with the assistance of AI (Claude Code). Data choices, filtering rules and checks were reviewed by the team. Details: `docs/SI_USAGE_LOG.md`.

## Готові дані: нічого запускати не треба

| Файл | Що всередині |
|---|---|
| `data/fires_v2_2000-2015.csv.gz` + `data/fires_v2_2016-2026.csv.gz` | таблиця `fires` по Україні, 2 406 185 точок, 01.11.2000–14.11.2026; поділена на 2 частини, бо разом 28 МБ > командного ліміту ~20 МБ |
| `data/grid_monthly_UKR_v1.csv.gz` | `grid_monthly` лише для України (2000–2025), 292 101 рядок — щоб гармонізацію можна було почати, не чекаючи світу |
| `data/fires_v2_stats.json` | що прочитано й відкинуто, розбивка по роках × супутниках, `confidence`, областях |
| `data/regions.json`, `data/regions.geojson` | 27 областей України; властивість `region` = `fires.region` |
| Google Drive `processed/grid_monthly_v1.csv(.gz)` | `grid_monthly` для світу (будується зараз, див. нижче) |

```python
import pandas as pd
fires = pd.concat(pd.read_csv(f, parse_dates=["date"]) for f in
                  ["data/fires_v2_2000-2015.csv.gz", "data/fires_v2_2016-2026.csv.gz"])
grid_ua = pd.read_csv("data/grid_monthly_UKR_v1.csv.gz")
```

### Колонки `fires` (v2)

`date, lat, lon, sensor, satellite, frp, confidence, cell_id, region`

| Колонка | Приклад | Опис |
|---|---|---|
| `date` | `2024-08-15` | дата прольоту (UTC) |
| `lat`, `lon` | `48.4833`, `38.7947` | центр пікселя, 4 знаки ≈ 11 м |
| `sensor` | `MODIS` / `VIIRS` | |
| `satellite` | `Terra` / `Aqua` / `SNPP` / `NOAA20` / `NOAA21` | NOAA-21 лише за 2026 рік |
| `frp` | `11.9` | Fire Radiative Power, МВт |
| `confidence` | `low` / `nominal` / `high` | спільна шкала, див. нижче |
| `cell_id` | `48.25_38.75` | клітинка 0,25°, південно-західний кут — той самий ключ, що в `grid_monthly` |
| `region` | `Kyiv Oblast` | область англійською; також `Kyiv City`, `Sevastopol City`, `Autonomous Republic of Crimea` |

### Колонки `grid_monthly`

`cell_id, lat, lon, year, month, sensor, satellite, count, frp_sum` — `lat`/`lon` — центр клітинки; рядків із `count = 0` немає.

## Відтворити з нуля

Потрібен лише Node.js 18+, без залежностей.

```bash
node pipeline/01_download.js            # річні CSV України (MODIS, Suomi NPP, NOAA-20) + кордони областей
node pipeline/03_fetch_2026.js          # 2026 рік через FIRMS API (FIRMS_MAP_KEY у .env)
node pipeline/02_build_fires.js         # → fires (Україна)
node pipeline/05_grid_monthly.js ukraine  # → grid_monthly України + звірка сум із fires
node pipeline/04_download_world.js      # архіви світу ≈ 10 ГБ (FIRMS віддає ~0,8 МБ/с на з'єднання)
node pipeline/05_grid_monthly.js watch  # агрегує кожен архів, щойно він завантажився; наприкінці merge
```

Усе, що завантажується й будується, лежить у `pipeline/data/` і не потрапляє в git.

## Що робить очищення

1. **Джерела (NASA FIRMS):**
   - **Річні файли по країнах і архіви світу** `<sensor>_<year>_all_countries.zip` (Standard Processing):
     - MODIS C6.1 (MCD14ML), Terra + Aqua, 2000–2025;
     - VIIRS 375 m Suomi NPP (VNP14IMGML), 2012–2025 — **еталон**;
     - VIIRS 375 m NOAA-20 (VJ114IMGML), 2018–2025 — **місток** після вимкнення Suomi NPP.
   - **2026 рік (лише Україна):** FIRMS Area API — Standard Processing, поки він є, далі NRT. Покриття: MODIS до 14.11, Suomi NPP до 02.11, NOAA-20 і NOAA-21 до 14.11. Це **попередні дані**.
2. **Лише `type = 0`** (ймовірна пожежа рослинності). Відкинуто статичні й промислові джерела: металургію, факели, ТЕС.
3. **`satellite`:** коди FIRMS `Terra`/`Aqua`/`N`/`N20`/`N21` переводимо в значення контракту `Terra`/`Aqua`/`SNPP`/`NOAA20`/`NOAA21`.
4. **`confidence`:** MODIS 0–100 → `<30 low`, `30–79 nominal`, `≥80 high` (класи MODIS C6 User Guide); VIIRS `l/n/h` → `low/nominal/high`. Точки з `low` не видалено — рішення за data scientist.
5. **`cell_id`:** `floor(lat / 0.25) · 0.25` і `floor(lon / 0.25) · 0.25`, два знаки після коми.
6. **Область (лише `fires`):** точка в полігоні за кордонами geoBoundaries ADM1 (OSM, ODbL). Точки біля кордону чи узбережжя, що випали за полігон, привʼязано до найближчої області: ≤5 км для річних CSV, ≤1 км для 2026 року. З річних CSV не втрачено жодної точки; з API 2026 року відкинуто 81 134 точки сусідніх країн.

## Перевірки

- **Сума `grid_monthly` України = сума `fires`** у кожній із 72 пар «рік × супутник» за 2000–2025 (`05_grid_monthly.js ukraine` друкує звірку).
- **Suomi NPP ≈ NOAA-20:** для України кількості майже однакові (2019: 80 317 і 79 882; 2024: 79 257 і 88 071) — місток NOAA-20 → SNPP коректний.
- Кожен архів світу має `*.stats.json` поруч із частиною сітки: скільки точок прочитано, скільки з `type = 0`.

## Підсумок `fires` по роках

| Рік | Terra | Aqua | SNPP | NOAA20 | NOAA21 |
|---|---:|---:|---:|---:|---:|
| 2000* | 53 | | | | |
| 2001 | 27 321 | | | | |
| 2002 | 20 164 | 7 718 | | | |
| 2005 | 20 766 | 21 240 | | | |
| 2010 | 8 413 | 10 194 | | | |
| 2012 | 7 425 | 10 899 | 48 789 | | |
| 2015 | 21 147 | 26 004 | 153 668 | | |
| 2018 | 7 505 | 9 726 | 53 860 | 51 528 | |
| 2020 | 11 184 | 13 518 | 76 623 | 77 269 | |
| 2022 | 6 380 | 7 968 | 47 142 | 54 343 | |
| 2024 | 9 097 | 13 738 | 79 257 | 88 071 | |
| 2025 | 5 288 | 10 893 | 59 675 | 60 963 | |
| 2026** | 6 205 | 11 376 | 69 341 | 73 659 | 67 628 |

Повна таблиця по всіх роках — `data/fires_v2_stats.json` → `byYear`.
\* лише листопад–грудень 2000. \** 2026 — попередні дані (NRT з вересня/серпня), Suomi NPP до 02.11.

## Важливі обмеження (для гармонізації й розділу Validity)

- **До 04.07.2002 працював лише Terra**: MODIS 2000–2002 систематично занижений.
- **VIIRS 2012–2014:** у перші 18–24 місяці були хибні кластери пікселів (NASA FIRMS FAQ).
- **Suomi NPP вимкнено 02.11.2026** — у листопаді 2026 є лише MODIS, NOAA-20 і NOAA-21.
- **Мало точок узимку:** 0–30 точок на місяць по Україні, співвідношення VIIRS/MODIS там нестабільне — коефіцієнти варто згладжувати або рахувати по сезонах.
- **2026, NRT-частина:** поля `type` немає; промислові джерела позначені за історичною маскою (клітинка ~1 км, де у 2000–2025 траплялося `type = 2`). Це наближення, а не класифікація NASA.
- **Світ:** архіви `all_countries` містять лише точки на території країн (без океану); подвійний підрахунок у перекритті орбіт і хмарність не враховані — для цього NASA радить Level 2G.
- Окуповані території (Крим, частини сходу й півдня) входять у дані FIRMS по Україні й привʼязані до своїх областей.

## Ключ FIRMS

Скопіюйте `.env.example` у `.env` у корені й впишіть `FIRMS_MAP_KEY`. Файл `.env` є в `.gitignore`. Безкоштовний ключ: https://firms.modaps.eosdis.nasa.gov/api/map_key/

## Цитування (для полів NASA Data і References)

> We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System (ESDIS).

Кордони областей: geoBoundaries (Runfola et al. 2020), https://www.geoboundaries.org/, джерело OpenStreetMap, ліцензія ODbL 1.0.
