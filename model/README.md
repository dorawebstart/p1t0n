# model/

Власник: data scientist (Крупіца Єгор) — гармонізація MODIS → Suomi NPP.

Працюйте у своїй гілці, у `main` — через Pull Request. Правила: `docs/TEAM_WORKFLOW.md`.

## Скрипти

| Скрипт | Що робить | Вихід (`model/out/`) |
|---|---|---|
| `harmonize.py` | Україна одним рядом: коефіцієнти SNPP/Aqua і SNPP/Terra для кожного місяця | `ukraine_monthly.csv`, `coefficients_ukraine.csv` |
| `harmonize_grid.py` | Сітка 0,25°, будь-яка зона: коефіцієнти для кожної пари «широтний пояс 10° × місяць» | `grid_harmonized_<tag>.csv.gz`, `coefficients_<tag>.csv`, `metrics_<tag>.json`, `validation_<tag>.csv` |

Запуск з кореня репозиторію:

```
python model/harmonize.py
python model/harmonize_grid.py                                    # тест на data/grid_monthly_UKR_v1.csv.gz
python model/harmonize_grid.py --input <grid_monthly_v1.csv.gz> --tag world   # світ, файл Миколи з Drive
```

`harmonize_grid.py` читає вхід частинами (по 2 млн рядків), тож світовий файл не треба тримати в пам'яті як сирі рядки. Перевірки: з одним поясом (`--band 180`) сума клітинок України збігається з `harmonize.py` (різниця ≤ 0,13 точки на місяць, це округлення).

## Точність (Україна, сітка, навчання 2012–2020, перевірка на відкладених 2021–2025)

| Що порівнюємо з реальним SNPP | MAE (точок / місяць) | R² | Зміщення |
|---|---|---|---|
| MODIS як є (без гармонізації) | 3007 | 0,16 | −71 % |
| MODIS після гармонізації | 593 | 0,95 | +3,7 % |

На рівні окремих клітинок за місяць: MAE 5,6 точки, R² 0,75. Повні цифри — `out/metrics_UKR.json`, ряди — `out/validation_UKR.csv`.

## Method (English, for the project page)

**Two sentences.** VIIRS sees several times more fires than MODIS, so we learned, on 2012–2020 when both instruments flew, how many Suomi NPP VIIRS detections correspond to one MODIS detection in every 10° latitude band and month of the year, separately for Aqua and Terra. MODIS counts for 2000–2011 are converted to this "VIIRS scale" and joined with real Suomi NPP counts from 2012, giving one 25-year record in which the sensor no longer matters.

**Paragraph for the Detailed Project Description.** NASA FIRMS records active fires from MODIS (Terra and Aqua, since 2000, ~1 km pixels) and VIIRS (Suomi NPP since 2012, NOAA-20, NOAA-21, 375 m pixels). VIIRS detects several times more hotspots for the same fires, so simply adding the archives creates a false jump in fire activity in 2012. We use one fixed VIIRS reference, Suomi NPP, so that the record does not grow just because more VIIRS satellites were launched. On the 0.25° grid, for every 10° latitude band and month of the year, we compute the ratio of Suomi NPP detections to Aqua detections and, separately, to Terra detections over 2012–2020 (the ratio depends on latitude because MODIS has gaps between orbits near the equator, and on the season because fire size and cloud cover change). Thin band-months borrow data from neighbouring months and then neighbouring bands, and every coefficient records how it was obtained. MODIS counts of each cell are scaled with these coefficients, with Aqua and Terra weighted by their share of detections in the band; because the scaling is linear, the harmonized total of any area drawn on the map equals the sum of its cells. From February 2012 the harmonized record is the real Suomi NPP count. We checked the method on years it never saw (2021–2025): for Ukraine, monthly totals of scaled MODIS match real Suomi NPP with R² = 0.95 and a bias of +3.7 %, compared with R² = 0.16 and −71 % for raw MODIS.

**Limitations (for `metrics.json` → `notes`).** Winter months have few MODIS detections, so one detection is multiplied by 5–20 and harmonized winter values before 2012 are noisy. Terra's morning overpass sees fires VIIRS misses; it has its own coefficient, but its orbit drifted after 2020, which affects the 2021–2025 check. Coefficients are per latitude band, not per land cover type yet. 2026 data are near-real-time and preliminary; after Suomi NPP stopped on 2 November 2026 the record continues through the NOAA-20 → Suomi NPP bridge.

Parts of the code and of this text were written with the assistance of AI (Claude). The harmonization approach is the team's own.
