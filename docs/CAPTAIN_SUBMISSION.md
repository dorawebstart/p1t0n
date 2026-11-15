# Файл капітана — подання 15.11

Тут усе для подання проєкту: що лишилося зробити, розклад і готові англійські тексти для кожного поля форми.
Детальний звіт перевірки — `docs/SITE_AUDIT.md`. Бриф презентації — `docs/PRESENTATION_BRIEF.md`. Підготовка до захисту — `docs/DEFENSE_PREP.md`.

## 1. Статус (оновлено 15.11 вдень)

**Готово**
- Сайт працює: https://dorawebstart.github.io/p1t0n/. Усі 574 файли даних відкриваються, помилок у консолі немає.
- Репозиторій публічний, README англійською з References і розділом про ШІ, є LICENSE.
- Чесні формулювання про місток NOAA-20; σ однакове для всіх зон.
- Дані світу — у публічному релізі https://github.com/dorawebstart/p1t0n/releases/tag/data-v1 (без входу).
- На сторінці команди 6 учасників; Description оновлюєте ви.

**Лишилось**

| Що | Хто | До коли |
|---|---|---|
| Відео ≤ 30 с з англійськими субтитрами + 7 слайдів, посилання відкриваються без входу | Василина | **20:00** |
| Посилання на відео — на сайт і в README (надіслати Claude) | капітан → Claude | після 20:00 |
| Заповнити поля форми (тексти нижче) і натиснути **Save Progress** | капітан | 20:00–22:00 |
| Перевірити всі посилання в приватному вікні (Ctrl+Shift+N) і з телефона | капітан | 22:00 |
| **Submit for Judging** + два чекбокси | капітан | **22:30** |
| Після 23:55 нічого не зберігати й не редагувати | усі | **23:55** |
| FortiGuard (необов'язково): https://www.fortiguard.com/faq/wfratingsubmit, URL сайту, категорія Education, Company Name `N/A` | капітан | будь-коли |
| Репетиція захисту | Іван, Коля | до 17.11 14:00 |

## 2. Як заповнювати форму

Шлях: профіль → **My Team** → вкладка **Project** → **Edit**.
- Перед редагуванням увімкніть **Lock**.
- Часто натискайте **Save Progress**.
- Усе — англійською.
- Зображення (JPG, PNG до 10 МБ) можна вставити просто в Description — наприклад, скрін календаря й картки Validation.

---

### Project Name
```
Harmonized Fire Calendar
```

### High-Level Project Summary
```
Harmonized Fire Calendar puts 25 years of NASA fire satellite observations on one scale. MODIS (Terra, Aqua; since 2000, 1 km pixels) and VIIRS (since 2012, 375 m pixels) count the same fires very differently — VIIRS sees 3–5 times more hotspots — so joining their archives creates a false jump in 2012. With Suomi NPP data ending on 2 November 2026 and MODIS retiring, long fire records must be stitched across instruments. On the years both flew, we measured, for every month and latitude band, how many Suomi NPP VIIRS hotspots correspond to one MODIS hotspot, translated MODIS 2000–2011 into the VIIRS scale and tested it on five years the model never saw (R² 0.95 for Ukraine, 0.86 for the world; raw MODIS 0.16). The web app turns this harmonized record into a burning calendar for any of 256 regions — the world, 227 countries, Ukraine and its oblasts: month × year heat map, historical median, anomalies, a world map and CSV/PNG downloads. It serves early-warning services, firefighters, researchers and land managers, who can now compare today's fire activity with the whole 25-year history.
```

### Link to Project Demo
Посилання на **відео ≤ 30 с** (YouTube «Unlisted» або Google Drive «Anyone with the link»). Сюди йде **одне** посилання.

### Link to Final Project
```
https://dorawebstart.github.io/p1t0n/
```

### Detailed Project Description
```
WHAT IT DOES
Harmonized Fire Calendar is a web application that answers: how does fire activity in a place compare with the last 25 years? It shows one consistent monthly series of NASA FIRMS active-fire hotspots from November 2000 to October 2026 on the Suomi NPP VIIRS scale, so the sensor of origin no longer matters.

Features
• Burning calendar (month × year heat map) for 256 ready-made regions: the world, 227 countries, Ukraine and its 27 oblasts.
• Historical median of each calendar month, z-score anomalies (|z| > 2 highlighted), 25–75 % expected range and a noise estimate for every month.
• Series switch Harmonized / raw MODIS / raw VIIRS — the effect of harmonization is visible at once.
• Date range by month; CSV and PNG downloads of the calendar.
• World map of 1° cells (2000–2025) with the same three layers; click a cell for its numbers.
• Ukraine: individual MODIS and VIIRS hotspots for 2026 on the map, with CSV download.
• Colour-blind-safe scales (inferno; blue/orange for MODIS/VIIRS) with numeric legends; works on phones.
• The method, coefficients, validation and limitations are published on the page.

HOW IT WORKS
1. Data: NASA FIRMS yearly standard-processing archives for the whole world — MODIS Collection 6.1 (2000–2025), VIIRS 375 m Suomi NPP (2012–2025) and NOAA-20 (2018–2025); 515 million hotspots, vegetation fires only (type = 0). 2026 comes from the FIRMS API (near-real-time, marked preliminary).
2. Grid: hotspots counted per 0.25° cell, month and satellite (191,187 cells, 228 countries).
3. Reference: one VIIRS satellite, Suomi NPP, for the whole period — adding NOAA-20 on top would double counts from 2018 just because a satellite was added.
4. Coefficients: on the overlap years 2012–2020, k(m) = Σ Suomi NPP / Σ MODIS for every calendar month and 10° latitude band, separately for Terra (≈10:30 overpass) and Aqua (≈13:30). The ratio of sums is the maximum-likelihood estimate of k for Poisson counts.
5. Harmonized series: MODIS 2000–2011 is scaled by k (Terra and Aqua averaged with weights proportional to their counts); from February 2012 the series is the real Suomi NPP count.
6. Calendar statistics: median of each month over all years, z = (H − median) / σ, quartiles.
7. Validation on unseen years 2021–2025 (60 monthly totals): Ukraine R² 0.95, bias +3.7 % (raw MODIS: R² 0.16, bias −71 %); world R² 0.86, bias +0.1 %. Most of the remaining bias comes from Suomi NPP outages in July–August 2022 and July 2024: without those three months Ukraine reaches R² 0.98, bias −0.7 %.
8. Continuity: the NOAA-20 / Suomi NPP ratio is measured on 2018–2025 (1.033 by sums, 1.007 monthly median) to continue the series after Suomi NPP ends.

BENEFITS
• One comparable 25-year fire record instead of two incompatible ones.
• Any user can see which months burn most, which years were most active and whether this month is unusual against the historical median — for the world, a country or a Ukrainian oblast.
• Open, reproducible pipeline; static website that loads in one click and needs no server.

LOCAL IMPACT — UKRAINE
Ukraine burns twice a year: spring (26 % of hotspots in 2001–2025) and July–August (49 %). Compared with 2012–2021, hotspots in 2022–2025 fell by 63 % outside five frontline oblasts and rose by 39 % inside them. We show changes in the burning regime, not their causes.

LIMITATIONS AND NEXT STEPS
Counts are not yet normalized for observing days; coefficients assume a stable ratio over time (Terra's orbit drift after ~2022 increases recent errors); winter months before 2012 are noisy; fire size, FRP, scan angle and clouds are absorbed into k. Next: apply the NOAA-20/NOAA-21 bridge, normalize for outages, robust anomalies, custom areas drawn on the map, hotspot files for all years.

TOOLS
Node.js (data pipeline), Python with pandas, NumPy and Matplotlib (harmonization, validation), plain HTML/CSS/JavaScript, Leaflet (map), three.js (3D charts), GitHub Pages (hosting), GitHub Actions (deploy).

LINKS
• Live site: https://dorawebstart.github.io/p1t0n/
• Code: https://github.com/dorawebstart/p1t0n
• Processed data: https://github.com/dorawebstart/p1t0n/releases/tag/data-v1
• Slides (7): <ПОСИЛАННЯ НА СЛАЙДИ>
• Demo video: <ПОСИЛАННЯ НА ВІДЕО>
```

### Use of Super Intelligence (SI)
```
We used AI coding assistants as accelerators: Claude Code (Anthropic) and Google Gemini. They helped write and debug data-processing scripts (download, gridding, harmonization, validation), the static data export and parts of the website code, translate and edit documentation, and review the site, repository and method before submission. The idea of the solution, the choice of the method (Suomi NPP as the single reference, monthly ratio-of-sums coefficients per latitude band, separate Terra/Aqua scaling, the train/test design) and all conclusions are the team's own; every result was run and checked by the team. AI-assisted files say so in their header comment, the repository README has a "Use of AI" section, and the log is in docs/SI_USAGE_LOG.md. No AI-generated images, video or audio are used in the project.
```
Якщо Василина використає ШІ-картинки в слайдах або відео, допишіть: `AI-generated images in the slides carry a visible watermark.`

### NASA Data
```
NASA FIRMS (Fire Information for Resource Management System), https://firms.modaps.eosdis.nasa.gov/ — the core of the project.
• MODIS Collection 6.1 active fire product (MCD14 / MOD14 Terra / MYD14 Aqua), 1 km: global yearly standard-processing archives, November 2000 – December 2025.
• VIIRS 375 m active fire product, Suomi NPP (VNP14IMG): global yearly archives, January 2012 – December 2025; the reference scale of the harmonized series.
• VIIRS 375 m, NOAA-20 (VJ114IMG): 2018–2025, used to measure the NOAA-20 / Suomi NPP bridge ratio.
• 2026: FIRMS API near-real-time data (MODIS, Suomi NPP, NOAA-20) for Ukraine, marked preliminary.
Downloaded from https://firms.modaps.eosdis.nasa.gov/data/country/ (no key) and the FIRMS API. Fields used: latitude, longitude, acq_date, satellite, instrument, confidence, frp, type. 515,029,947 hotspots (type = 0) aggregated to a 0.25° monthly grid; all harmonization coefficients, the calendar and the validation are computed from these data. Context: NASA Earthdata, "Transitioning from Suomi NPP VIIRS/OMPS: what FIRMS users need to know" (2026).
```

### Space Agency Partner Data and Other References
```
No space agency partner data were used.

Data
• Natural Earth Admin 0 country boundaries (public domain) — https://www.naturalearthdata.com/
• geoBoundaries, Ukraine ADM1 oblast boundaries (ODbL). Runfola, D. et al. (2020) PLoS ONE 15(4): e0231866 — https://www.geoboundaries.org/
• OpenStreetMap map tiles © OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright

Software and libraries
• Leaflet 1.9.4 (BSD-2-Clause) — https://leafletjs.com/ (via unpkg.com)
• three.js r128 (MIT) — https://threejs.org/ (via cdnjs.cloudflare.com)
• pandas, NumPy, Matplotlib (BSD-style licences); Node.js
• pycountry (LGPL) — country names at build time
• GitHub Pages and GitHub Actions — hosting and deploy

Fonts and design
• Inter, JetBrains Mono, Playfair Display — Google Fonts, SIL Open Font License
• Motion studies "Tab pill", "Segmented control", "Magnetic button", "Weight wave", "Scramble text" — designbookmark.com/motion, rebuilt in plain JavaScript
• Colour scales: inferno (Matplotlib) and the Okabe–Ito colour-blind-safe palette

Science
• Giglio, L., Schroeder, W., Justice, C. O. (2016) The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment 178, 31–41.
• Schroeder, W. et al. (2014) The New VIIRS 375 m active fire detection data product. Remote Sensing of Environment 143, 85–96.

AI tools: Claude Code (Anthropic), Google Gemini — see the SI field and docs/SI_USAGE_LOG.md.
All code is original work of Team P1t0n with the AI assistance described; repository license MIT.
```

---

## 3. Перед «Submit for Judging» — чекліст

- [ ] Усі поля заповнені англійською; у Description замінено `<ПОСИЛАННЯ НА …>`.
- [ ] Link to Project Demo — одне посилання, відео ≤ 30,0 с, англійські субтитри.
- [ ] Слайдів ≤ 7, на титульному — назва команди, 6 імен, назва челенджу.
- [ ] Кожне посилання відкривається в приватному вікні без входу: сайт, репозиторій, реліз, відео, слайди.
- [ ] Ніде немає логотипів NASA і людей до 18 років; ШІ-картинки — з водяним знаком.
- [ ] Members — 6 людей, усі на Local Event Dnipro.
- [ ] Обидва чекбокси: Terms and Conditions і «Confirm All Work is Original».
- [ ] Після натискання з'явився банер про успішне подання.
- [ ] Після 23:55 — нічого не зберігати.

## 4. Якщо щось зламалось

- **Сайт не відкривається:** перевірити https://github.com/dorawebstart/p1t0n/actions (останній деплой має бути зелений); написати Claude.
- **Форма не дає подати:** не заповнене якесь обов'язкове поле (позначене *).
- **Хтось затер правки:** завжди вмикайте Lock перед редагуванням; останнє збереження перемагає.
