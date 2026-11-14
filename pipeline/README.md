# pipeline/

Власник: data engineer. Будує таблицю **`fires`** (див. `CLAUDE.md`, розділ «Контракт даних»): очищені точки активних пожеж MODIS + VIIRS по Україні з назвою області.

Працюйте у своїй гілці, у `main` — через Pull Request. Правила: `docs/TEAM_WORKFLOW.md`.

> Parts of the code in this folder were written with the assistance of AI (Claude Code). Data choices, filtering rules and checks were reviewed by the team. Details: `docs/SI_USAGE_LOG.md`.

## Готові дані: нічого запускати не треба

`data/fires_v1.csv.gz` (18 МБ) — це вся таблиця `fires`: 1 784 856 рядків, 01.11.2000–14.11.2026.

```python
import pandas as pd
fires = pd.read_csv("data/fires_v1.csv.gz", parse_dates=["date"])
```

У Node: `zlib.gunzipSync(fs.readFileSync('data/fires_v1.csv.gz'))`. На Windows файл розпаковує 7-Zip.

## Відтворити з нуля

Потрібен лише Node.js 18+, без залежностей.

```bash
node pipeline/01_download.js      # ~150 МБ річних CSV з NASA FIRMS (2000–2025) + кордони областей
node pipeline/03_fetch_2026.js    # 2026 рік через FIRMS API (потрібен FIRMS_MAP_KEY у .env)
node pipeline/02_build_fires.js   # ~1,5 хв → pipeline/data/out/fires.csv + файли в data/
```

Сирі файли й повний `fires.csv` (~104 МБ) лежать у `pipeline/data/`, і git їх не бачить. Для Google Drive: сирі CSV кладемо в `raw/`, `fires.csv` — у `processed/fires_v1.csv`.

## Вихідні файли (`data/`)

| Файл | Для кого | Що всередині |
|---|---|---|
| `fires_v1.csv.gz` | data scientist, капітан | `date,lat,lon,sensor,frp,confidence,region` |
| `regions.json` | капітан (`/api/regions`) | 27 назв областей |
| `regions.geojson` | фронтенд (карта) | кордони областей, властивість `region` збігається з `fires.region` |
| `fires_v1_stats.json` | сторітелер, Validity | скільки точок прочитано й відкинуто, розбивка по роках, `confidence` і областях |

### Колонки `fires`

| Колонка | Приклад | Опис |
|---|---|---|
| `date` | `2024-08-15` | дата прольоту (UTC) |
| `lat`, `lon` | `48.4833`, `38.7947` | центр пікселя, 4 знаки ≈ 11 м |
| `sensor` | `MODIS` / `VIIRS` | MODIS = Terra + Aqua; VIIRS = **лише Suomi NPP** |
| `frp` | `11.9` | Fire Radiative Power, МВт |
| `confidence` | `low` / `nominal` / `high` | спільна шкала, див. нижче |
| `region` | `Kyiv Oblast` | англійська назва області; також `Kyiv City`, `Sevastopol City`, `Autonomous Republic of Crimea` |

## Що робить очищення

1. **Джерела (NASA FIRMS):**
   - **2000–2025:** «Country Yearly Summary» — Standard Processing, науковий рівень якості.
     - MODIS Collection 6.1 (MCD14ML), Terra + Aqua, з 01.11.2000.
     - VIIRS 375 m (VNP14IMGML), Suomi NPP, з 20.01.2012.
   - **2026:** FIRMS Area API. Це Standard Processing, поки він є (MODIS до 31.08, VIIRS до 31.07), а далі NRT.
2. **Лише `type = 0`** (ймовірна пожежа рослинності). Відкинуто 254 582 точки статичних і промислових джерел: металургії, факелів, ТЕС.
3. **Confidence зведено до однієї шкали:**
   - MODIS 0–100 → `<30 low`, `30–79 nominal`, `≥80 high` (класи з MODIS C6 User Guide);
   - VIIRS `l/n/h` → `low/nominal/high`.
   - Точки з `low` **не видалено**, рішення за data scientist. NASA радить для меншої кількості хибних тривог залишати `nominal` + `high`.
4. **Область:** точка в полігоні за кордонами geoBoundaries ADM1 (OSM, ODbL).
   - Точки біля кордону чи узбережжя, що випали за полігон, прив'язано до найближчої області: у межах ~5 км для річних CSV і ~1 км для 2026 року, разом 6 580 точок.
   - З річних CSV не втрачено жодної точки.
   - З API за 2026 рік відкинуто 30 240 точок із сусідніх країн.

## Підсумок даних

| Рік | MODIS | VIIRS | | Рік | MODIS | VIIRS |
|---|---:|---:|---|---|---:|---:|
| 2000* | 53 | – | | 2013 | 12 478 | 42 806 |
| 2001 | 27 321 | – | | 2014 | 50 376 | 147 810 |
| 2002 | 27 882 | – | | 2015 | 47 151 | 153 668 |
| 2003 | 12 209 | – | | 2016 | 24 885 | 81 445 |
| 2004 | 20 388 | – | | 2017 | 33 966 | 103 479 |
| 2005 | 42 006 | – | | 2018 | 17 231 | 53 860 |
| 2006 | 26 283 | – | | 2019 | 26 517 | 80 317 |
| 2007 | 34 225 | – | | 2020 | 24 702 | 76 623 |
| 2008 | 51 735 | – | | 2021 | 9 618 | 31 436 |
| 2009 | 37 840 | – | | 2022 | 14 348 | 47 142 |
| 2010 | 18 607 | – | | 2023 | 11 223 | 37 131 |
| 2011 | 26 112 | – | | 2024 | 22 835 | 79 257 |
| 2012 | 18 324 | 48 789 | | 2025 | 16 181 | 59 675 |
| | | | | 2026** | 17 581 | 69 341 |

\* лише листопад–грудень 2000 (Terra почав давати дані 01.11.2000).
\** MODIS до 14.11.2026, VIIRS S-NPP до 02.11.2026. На стику SP і NRT співвідношення VIIRS/MODIS не стрибає: серпень–жовтень 2026 дає 3.8–4.0, як і у 2025 році.

На періоді перекриття VIIRS дає приблизно **в 3–4 рази більше точок**, ніж MODIS. Саме цей «стрибок» гармонізує data scientist.

## Важливі обмеження (для гармонізації й розділу Validity)

- **До 04.07.2002 працював лише Terra**, тож MODIS 2000–2002 систематично занижений відносно пізніших років.
- **VIIRS 2012–2014:** у перші 18–24 місяці були хибні кластери пікселів (NASA FIRMS FAQ).
- **NOAA-20 і NOAA-21 навмисно не додані:** інакше ряд VIIRS стрибнув би ще у 2018 і 2024 роках.
- **Suomi NPP вимкнено 02.11.2026.** Тому в листопаді 2026 року VIIRS немає, і поточний місяць можна гармонізувати лише з MODIS. Для продовження ряду в майбутньому потрібен NOAA-20 з окремим коефіцієнтом.
- **Мало точок узимку:** у зимові місяці буває 0–30 точок, і співвідношення VIIRS/MODIS там дуже нестабільне (від 5 до 12). Коефіцієнти варто згладжувати або рахувати по сезонах.
- **2026, NRT-частина:** у NRT немає поля `type`. Промислові джерела позначені за історичною маскою: клітинка ~1 км, де у 2000–2025 роках траплялося `type = 2`. Це наближення, а не класифікація NASA.
- Річні CSV не враховують хмарність і подвійний підрахунок у місцях перекриття орбіт. Для цього NASA радить продукти Level 2G.
- Окуповані території (Крим, частини сходу й півдня) входять у дані FIRMS по Україні й прив'язані до своїх областей.

## Ключ FIRMS

Скопіюйте `.env.example` у `.env` у корені й впишіть `FIRMS_MAP_KEY`. Файл `.env` є в `.gitignore`, тож у публічний репозиторій ключ не потрапить. Безкоштовний ключ: https://firms.modaps.eosdis.nasa.gov/api/map_key/

`03_fetch_2026.js` кешує відповіді API в `pipeline/data/raw/api2026/`, тому повторний запуск майже не витрачає запитів.

## Цитування (для полів NASA Data і References)

> We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System (ESDIS).

Кордони областей: geoBoundaries (Runfola et al. 2020), https://www.geoboundaries.org/, джерело OpenStreetMap, ліцензія ODbL 1.0.
