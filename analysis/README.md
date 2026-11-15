# analysis/

Власник: аналітик / валідація (Іван) — перевірка точності гармонізації, календар, metrics.json, графіки для слайдів (docs/figures/).

Працюйте у своїй гілці, у `main` — через Pull Request. Усе про проєкт: `docs/P1T0N.md`.

## Скрипти (запуск з кореня репозиторію)

| Скрипт | Що робить | Вихід |
|---|---|---|
| `step1_raw_series.py` | Сирі ряди MODIS і SNPP — хибний стрибок 2012 | `out/raw_series_ukraine.csv`, `docs/figures/raw_series_ukraine*.png` |
| `bridge_noaa20.py` | Місток NOAA-20 → Suomi NPP, 2018–2025 | `out/bridge_noaa20.csv`, `out/bridge_noaa20_summary.json`, `docs/figures/bridge_noaa20.png` |
| `validate_harmonization.py` | Точність на відкладених 2021–2025 (`modis_scaled` vs `snpp`). Спершу `python model/harmonize.py` | `out/validation_ukraine.json`, `out/validation_ukraine_monthly.csv`, `docs/figures/harmonized_ukraine.png` |
| `build_calendar.py` | Календар UKR + 27 областей за контрактом + `p25_count`, `p75_count` | `out/calendar.csv` |

Факти про Україну — `docs/P1T0N.md`, розділ 6.

Parts of the code were written with the assistance of AI tools (Gemini, Claude Code).
