# Україна: факти з календаря і тексти слайдів

Джерело: `analysis/out/calendar.csv` (`analysis/build_calendar.py`), `analysis/out/validation_ukraine.json`, `analysis/out/bridge_noaa20_summary.json`. Числа — гармонізовані точки у шкалі Suomi NPP, повні роки 2001–2025, якщо не сказано інше. Формулювання без тверджень про причини.

Підготував Єгор Крупіца разом із Claude Code замість Івана (задачі 1–5 від капітана). Перед слайдами — звірити числа ще раз.

## Факти (англійською, для слайда 6 і опису проєкту)

1. **Two burning seasons.** Ukraine burns twice a year: in spring (March–April, 26 % of all hotspots in 2001–2025) and in late summer (July–August, 49 %; August alone 32 %). December and January together account for less than 1 %.
2. **Most and least active years.** The most active years in the harmonized record are 2008 (≈ 190 000 hotspots), 2001 (≈ 184 000), 2015 (≈ 154 000) and 2014 (≈ 148 000). The quietest are 2021 (≈ 31 000), 2003 (≈ 37 000) and 2023 (≈ 37 000).
3. **A changed geography of burning since 2022.** Compared with 2012–2021, the average yearly number of hotspots in 2022–2025 fell by 32 % in Ukraine as a whole and by 63 % outside the five frontline oblasts (Donetsk, Luhansk, Zaporizhzhia, Kherson, Kharkiv), but rose by 39 % in those five oblasts: Kherson ×1.9, Donetsk ×1.5.
4. **Anomaly in 2026 (preliminary).** June 2026 had about 6 200 hotspots against a June median of about 1 050 (z = +3.8). 2026 data are near-real-time and preliminary.

Що варто знати, перш ніж показувати:
- Факт 3 — порівняння середніх; «прифронтові області» — лише перелік областей, причин не називаємо.
- Зимові аномалії до 2012 року ненадійні: одна точка MODIS множиться на 10–20, тож великі z-score у січні–лютому 2007–2008 — шум, не показувати.

## Тексти слайдів (до 30 слів)

**Slide 2 — Problem** (Іван; графік `docs/figures/raw_series_ukraine.png`):
> NASA satellites have tracked fires since 2000. MODIS is retiring; Suomi NPP data stopped on 2 November 2026. VIIRS sees 3× more hotspots: joined records jump falsely in 2012.

**Slide 5 — NASA data and method** (Єгор):
> NASA FIRMS hotspots 2000–2026: MODIS (Terra, Aqua) and VIIRS (Suomi NPP, NOAA-20). For each latitude band and month we learn how many VIIRS hotspots equal one MODIS hotspot.

**Slide 6 — Accuracy and Ukraine** (Іван; графік `docs/figures/harmonized_ukraine.png`):
> On unseen years 2021–2025, harmonized MODIS matches real VIIRS: R² 0.95 (raw MODIS 0.16). Ukraine, 2022–2025 vs 2012–2021: hotspots −63 % in other oblasts, +39 % in five frontline oblasts.

## Ключові числа для перевірки

| Що | Значення | Файл |
|---|---|---|
| Точність, місяці 2021–2025 | R² 0,951; WAPE 14,0 %; зміщення +3,3 %; MAE 595 | `analysis/out/validation_ukraine.json` |
| Без гармонізації | R² 0,162; зміщення −70,9 % | там само |
| Похибка 2021–2023 vs 2024–2025 | WAPE 11,8 % vs 15,9 %; зміщення +2,4 % vs +4,0 % | там само |
| Річні суми 2021–2025 | похибка −2,6 %, +4,3 %, +4,3 %, +0,7 %, +8,3 % | там само |
| Місток NOAA-20 / SNPP | медіана 1,007 (25–75 %: 0,96–1,06), сумарно 1,033; 2019: 79 882 / 80 317 | `analysis/out/bridge_noaa20_summary.json` |

**Яке зміщення називати на слайдах і захисті: +3,7 %** — це число на сайті (`model/out/metrics_UKR.json`, Україна як сума клітинок сітки 0,25°). Тут, у `validation_ukraine.json`, +3,3 % — Україна за точками в межах кордону (полігон). Обидва правильні, різниця лише в тому, як окреслено Україну; щоб не плутати журі, усюди кажемо одне число — +3,7 %. (Капітан, 14.11)
