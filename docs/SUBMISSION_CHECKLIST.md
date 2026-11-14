# Чеклист подання — P1t0n, Space Apps 2026

Джерела: [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), мануал організаторів Дніпра (`HACKATHON_MANUAL.md`).

## Графік (час київський)

| Коли | Що |
|---|---|
| 14.11, до вечора | Сайт задеплоєно з фейковими даними; посилання перевірено; подано заявку FortiGuard |
| 15.11 15:55 | Фіча-фриз |
| 15.11 20:00 | Відео й слайди готові, лежать за публічними посиланнями |
| 15.11 22:30 | Перше «Submit for Judging» |
| 15.11 23:55 | Останнє збереження. Далі нічого не чіпаємо |
| 17.11 і 18.11, 14:00 | Захист у Zoom: 5 хв, живий прототип |

## Перед кнопкою «Submit for Judging»

**Команда**
- [ ] Усі 6 учасників на вкладці Members сторінки команди
- [ ] Усі зареєстровані на Local Event Dnipro, ніхто не у waitlist
- [ ] У профілі кожного Full Name записано так, як має бути в сертифікаті

**Посилання** (кожне відкрити в приватному вікні та з телефона через мобільний інтернет)
- [ ] Link to Final Project — живий сайт, не git
- [ ] Дзеркало сайту на другому хості
- [ ] Link to Project Demo — відео
- [ ] Слайди
- [ ] Репозиторій публічний
- [ ] Жодне посилання не просить логін, пароль чи «запит доступу»

**Демо**
- [ ] Відео **≤ 30 секунд** (перевірити тривалість файла, не «приблизно»)
- [ ] Якщо озвучка українською — є англійські субтитри
- [ ] Слайдів **≤ 7**, разом із титульним; усі англійською
- [ ] На слайдах: назва команди, імена учасників, назва челенджу
- [ ] Немає людей до 18 років у кадрі, на фото чи в озвучці

**Зміст**
- [ ] Усі поля форми англійською
- [ ] Усі обов'язкові поля заповнені
- [ ] У полі NASA Data — конкретні продукти FIRMS, роки, спосіб використання
- [ ] У References — усі бібліотеки, підкладки карт, GeoJSON, шрифти, зображення
- [ ] Немає логотипів, прапорів, емблем місій NASA — на сайті, у відео, на слайдах
- [ ] Згенеровані ШІ зображення й відео мають видимий водяний знак
- [ ] У README і на сайті сказано, де використано ШІ
- [ ] Вкладку Resources челенджу перевірено ще раз — чи не додали нових джерел

**Подання**
- [ ] Чекбокс Terms and Conditions
- [ ] Чекбокс Confirm All Work is Original
- [ ] Натиснуто «Submit for Judging», з'явився банер підтвердження
- [ ] Зроблено знімок екрана з банером

## Хостинг: як створити

Рекомендований варіант — статичний сайт із наперед порахованими файлами даних. Обґрунтування й альтернативи — у `CLAUDE.md`, розділ «Хостинг».

1. Зібрати фронтенд у теку зі статичними файлами (`npm run build` → `dist/`).
2. Покласти файли даних поруч: `data/regions.json`, `data/grid/<tile>.json`, `data/calendar/<region_id>.json`, `data/fires/UA/<YYYY-MM>.json`, `data/metrics.json`.
3. Основний хост: підключити репозиторій GitHub до Vercel або Cloudflare Pages, вказати команду збірки й теку результату. Кожен merge у `main` оновлює сайт.
4. Дзеркало: увімкнути GitHub Pages для того самого репозиторію (або другий із двох хостів вище).
5. Перевірити обидві адреси в приватному вікні.
6. Подати адресу основного сайту на класифікацію: https://www.fortiguard.com/faq/wfratingsubmit — категорія Education або Web-based Application, Company Name `N/A`.
7. Після фіча-фризу нічого не деплоїти без перевірки на дзеркалі.

Ліміти безкоштовних тарифів перевірити на сайті хоста в день деплою. Якщо плитки сітки завеликі — перейти з 0,25° на 0,5° або стиснути JSON (gzip віддають усі ці хости).

## Заготовки текстів для форми (англійською)

`TODO` — підставити реальні значення. Тексти — основа; кожен переписує свою частину своїми словами, капітан зводить у форму.

### Project Name
```
TODO: остаточна назва від команди (робоча: Harmonized Fire Calendar)
```

### High-Level Project Summary
```
NASA satellites have recorded active fires since 2000, but the record is split
between MODIS (1 km pixels), whose satellites are reaching the end of their
mission, and its successor VIIRS (375 m pixels, on several satellites). VIIRS
detects several times more hotspots for the same fires, so the archives cannot
simply be added together. We built a web application that harmonizes MODIS and
VIIRS hotspots from NASA FIRMS into one consistent burning activity calendar for
any area on Earth, 2000-2026. A user picks a country, a region or draws an area
on the map, sees a month-by-year heat map with anomalies against the historical
median, switches map layers between MODIS, VIIRS and the harmonized record, and
downloads the data. Ukraine is our detailed showcase. The tool gives emergency
responders, scientists and land managers a single comparable picture of when and
where burning happens.
```

### Detailed Project Description
```
What it does
- TODO: 3-4 bullets describing the working features.

How it works
- Data: MODIS (MCD14, Collection 6.1) and VIIRS 375 m (VNP14IMG, VJ114IMG) active
  fire hotspots for Ukraine from NASA FIRMS, TODO years.
- Harmonization: for each region and calendar month we estimate the VIIRS/MODIS
  detection ratio on the overlap period TODO, apply it to the MODIS-only years,
  and validate on held-out years TODO.
- Accuracy: MAE = TODO, R2 = TODO. Limitations: TODO.
- Calendar: month x year heat map, anomaly flag based on TODO.

Benefits
- TODO.

What we hope to achieve
- TODO.

Tools and languages
- TODO: Python, pandas, JavaScript, Leaflet, ...

Links
- Live site: TODO
- Mirror: TODO
- Source code: TODO
- Slide deck (7 slides): TODO
```

### Use of Super Intelligence (SI)
```
Yes. We used TODO (e.g. Claude Code) as a coding assistant for: TODO (data
cleaning scripts, API scaffolding, front-end components, text editing).
The project idea, the harmonization approach and all conclusions are our own.
All SI-assisted code is acknowledged in the repository README. TODO: state
whether any images or video were SI-generated; if yes, they carry a visible
watermark.
```
Заповнювати за `SI_USAGE_LOG.md`.

### NASA Data
```
NASA FIRMS (Fire Information for Resource Management System),
https://firms.modaps.eosdis.nasa.gov/
- MODIS Collection 6.1 active fire product (MCD14DL / MOD14 / MYD14), Terra and
  Aqua, global, TODO years - used as the long historical record.
- VIIRS 375 m active fire product (VNP14IMG Suomi NPP, VJ114IMG NOAA-20,
  VJ214IMG NOAA-21), global, TODO years - used as the reference for
  harmonization and for recent years.
We aggregated hotspot location, acquisition date, sensor, satellite and fire
radiative power into monthly counts on a global 0.25-degree grid, and kept
individual hotspots for Ukraine as the detailed showcase.
TODO: add MCD12Q1 land cover and NASA GIBS if used.
```

### Space Agency Partner Data and Other References
```
TODO: list every item actually used, for example:
- Leaflet (BSD-2-Clause), https://leafletjs.com/
- Map tiles: TODO provider and attribution
- Administrative boundaries of Ukraine: TODO source and license
- Chart library: TODO
- Fonts, icons: TODO
```

## Відео ≤ 30 с — таймінг за гайдом

| Час | Зміст |
|---|---|
| 0:00 | Хто говорить і назва команди |
| 0:02 | Який челендж і чому він нас зачепив |
| 0:05 | Назва проєкту й слоган |
| 0:10 | Як працює: екран сайту, дії користувача, роль даних NASA |
| 0:20–0:30 | Що це дає людям і що далі |

## Слайди ≤ 7

1. Назва проєкту, команда P1t0n, імена учасників, челендж
2. Проблема: MODIS завершує службу, VIIRS бачить більше — хибний «стрибок» після 2012
3. Рішення: глобальна гармонізована карта + календар для будь-якої зони (знімок екрана)
4. Як працює для користувача: зона → період → календар → завантаження
5. Дані NASA і точність (MAE, R² для світу й України, обмеження)
6. Приклад — Україна: аномалії режиму горіння, без тверджень про причини
7. Вплив і наступні кроки; адреса сайту
