# Пакет контексту для Gemini — Іван (аналітик)

Gemini в браузері не бачить репозиторію й даних — тому вгадує назви колонок і помиляється. Цей текст дає йому все потрібне.

**Як користуватись:**
1. Новий чат у Gemini.
2. Скопіювати весь блок нижче й надіслати першим повідомленням.
3. Далі просити по одному кроку.
4. Кожен скрипт **запускати в себе** і показувати Gemini помилку або вивід (перші рядки таблиці).
5. Перш ніж відкривати PR — **поглянути на графік очима** і звірити кілька чисел із таблицею нижче.

Якщо Gemini пропонує щось, що суперечить правилам із блоку, — правила важливіші.

````
Ти допомагаєш мені, аналітику команди P1t0n на NASA Space Apps Challenge 2026 (челендж «Harmonization of MODIS and VIIRS Hot Spots»). Пиши Python 3 + pandas + matplotlib. Скрипти запускаються з кореня репозиторію: python analysis/<назва>.py. Пиши маленькі скрипти, по одному кроку.

ДАНІ (точні назви колонок, нічого не вигадуй):
1) data/grid_monthly_UKR_v1.csv.gz — Україна, місячна сітка 0,25°:
   cell_id, lat, lon, year, month, sensor, satellite, count, frp_sum
   sensor: MODIS | VIIRS; satellite: Terra | Aqua | SNPP | NOAA20 | NOAA21; count — кількість точок у клітинці за місяць.
2) data/fires_v2_2000-2015.csv.gz і data/fires_v2_2016-2026.csv.gz — окремі точки України (одна таблиця у двох частинах, читати ОБИДВІ й склеювати pd.concat):
   date, lat, lon, sensor, satellite, frp, confidence, cell_id, region
   date — рядок YYYY-MM-DD (колонки acq_date НЕМАЄ); region — назва області англійською, напр. "Kyiv Oblast".
3) model/out/ukraine_monthly.csv — від Єгора (з'явиться пізніше): year, month, terra, aqua, snpp, modis_count, viirs_count, harmonized_count.

ГОЛОВНЕ ПРАВИЛО: VIIRS для довгого ряду = ЛИШЕ satellite == "SNPP". NOAA20 і NOAA21 — інші супутники; якщо їх додати, з 2018 року кількість подвоїться. MODIS = Terra + Aqua. Ніколи не групуй VIIRS лише за колонкою sensor.

ІНШІ ПРАВИЛА:
- Повні роки — 2001–2025. 2000 (лише лист.–груд.) і 2026 (неповний) або виключати, або позначати "partial / preliminary".
- Графіки: англійські підписи, кольори Okabe–Ito (MODIS #0072B2, SNPP #E69F00, NOAA20 #009E73, третій ряд #CC79A7), dpi 200, зберігати в docs/figures/. Внизу підпис "Source: NASA FIRMS. Team P1t0n."
- Таблиці-результати — в analysis/out/ (CSV).
- На початку кожного скрипта перевіряй, що потрібні колонки є, і зупиняйся зі зрозумілою помилкою, якщо ні.
- У шапці скрипта коментар: "Parts of this code were written with the assistance of AI (Gemini)."

МОЇ ЗАВДАННЯ ПО ЧЕРЗІ:
A) Місток NOAA-20 → SNPP: для кожного місяця 2018–2025, де обидва > 0, співвідношення NOAA20 / SNPP (сума по Україні). Результат: analysis/out/bridge_noaa20.csv (year, month, snpp, noaa20, ratio) + одне підсумкове число (медіана ratio) і розкид (25–75 перцентилі). Графік ratio за часом → docs/figures/bridge_noaa20.png.
B) Перевірка точності (коли буде model/out/ukraine_monthly.csv): на роках 2021–2025 порівняти harmonized_count з фактичним SNPP (viirs_count) — MAE і R², і MAE у відсотках від середнього. Графік «до / після»: сирий MODIS, SNPP і гармонізований ряд → docs/figures/harmonized_ukraine.png.
C) Календар за контрактом: analysis/out/calendar.csv з колонками
   region_id, year, month, modis_count, viirs_count, harmonized_count, median_count, anomaly
   region_id: "UKR" для всієї країни; для областей — "UKR-" + назва без " Oblast" і без "Autonomous Republic of ", пробіли → "-" (Kyiv Oblast → UKR-Kyiv, Kyiv City → UKR-Kyiv-City, Autonomous Republic of Crimea → UKR-Crimea).
   median_count — медіана harmonized_count того самого місяця за всі роки; anomaly — (harmonized_count − median_count) / стандартне відхилення того місяця, 2 знаки.
D) metrics.json: {"ukraine": {"mae": ..., "r2": ...}, "viirs_reference": "Suomi NPP 2012–2025; NOAA-20 bridged for 2026", "notes": "обмеження англійською"}.
````

## Числа для самоперевірки (річні суми по Україні, `grid_monthly_UKR_v1`)

| Рік | MODIS (Terra + Aqua) | SNPP | NOAA20 |
|---|---:|---:|---:|
| 2012 | 18 324 | 48 789 | — |
| 2018 | 17 231 | 53 860 | 51 528 |
| 2024 | 22 835 | 79 257 | 88 071 |

Якщо в тебе VIIRS у 2018 році близько 105 тисяч — ти склав SNPP і NOAA20.

Готовий приклад правильного скрипта — `analysis/step1_raw_series.py`.
