# Старт: промпт для свого Claude Code

Як користуватись:
1. `git pull` у своїй копії `p1t0n`.
2. Відкрити теку в Claude Code.
3. Скопіювати **свій** блок нижче цілком і надіслати першим повідомленням.

Claude Code сам прочитає `CLAUDE.md`. Детальніші задачі й терміни — `docs/ROLE_TASKS.md`.

Спільні правила для всіх:
- **Своя гілка** → Pull Request у `main`. Мерджить капітан.
- **Лише своя тека.** Чужі файли — тільки після слова власникові.
- **Малими кроками.** Кожен крок одразу запускаєш і перевіряєш.
- **Журнал ШІ.** Після роботи з ШІ — рядок у `docs/SI_USAGE_LOG.md`.

---

## Ростислав — капітан

```
Моя роль — капітан / бекенд / DevOps у команді P1t0n. Прочитай CLAUDE.md, docs/ROLE_TASKS.md і frontend/public/data/README.md.

Завдання зараз, по черзі:
1. Щойно Михайло зіллє каркас сайту у frontend/, налаштуй деплой статичного сайту з теки frontend/ (основний хост і дзеркало на другому хості). Допоможи мені вибрати хост, створити конфіг у репозиторії й перевірити збірку локально. Акаунти на хостингах створю я сам.
2. Поки каркаса немає — напиши backend/export_static.py (або .js): бере CSV від Єгора й Івана у форматі контракту v2 (calendar.csv, grid_harmonized.csv, metrics.json, data/fires_v2_*.csv.gz) і пише ті самі файли, що генерує backend/make_fake_data.js, у frontend/public/data/, з manifest.json "fake": false. Перевір на вхідних даних назви колонок і зупиняйся з повідомленням, якщо формат не той. Для перевірки зроби маленькі тестові CSV.
3. Після деплою — чеклист: посилання в приватному вікні, заявка FortiGuard (https://www.fortiguard.com/faq/wfratingsubmit).

Роби гілками captain/*, Pull Request у main.
```

## Микола — data engineer

```
Моя роль — data engineer у команді P1t0n. Прочитай CLAUDE.md, docs/ROLE_TASKS.md і pipeline/README.md.

fires_v2 і grid_monthly України вже в main. Завантаження світу триває у фоні — не переривай його.

Завдання зараз:
1. Довідник «клітинка → країна»: pipeline/06_cell_country.js. Для кожної клітинки 0,25°, що є в grid_monthly (світ), визнач код країни ISO-3 за відкритими межами країн (напр. Natural Earth Admin 0, 1:10m, public domain). Для клітинок України додай region_id області за правилом із CLAUDE.md (UKR-Kyiv тощо). Формат: cell_id, iso3, region_id. Клітинка на кордоні — за центром клітинки.
   Це потрібно, щоб рахувати календарі країн і областей.
2. Перевір на Україні: кожна клітинка grid_monthly_UKR має iso3 = UKR.
3. Коли світ агреговано — grid_monthly_v1.csv.gz і cell_country.csv на Google Drive (processed/), рядки в data/README.md з посиланням.

Джерело меж країн і ліцензію запиши в pipeline/README.md (для поля References). Гілка pipeline/*, Pull Request у main.
```

## Єгор — data scientist, гармонізація

```
Моя роль — data scientist (гармонізація) у команді P1t0n. Прочитай CLAUDE.md (розділ «Челендж», рішення про еталон Suomi NPP), docs/RESEARCH_FIRMS.md і docs/ROLE_TASKS.md.

Дані: data/grid_monthly_UKR_v1.csv.gz (cell_id, lat, lon, year, month, sensor, satellite, count, frp_sum) і data/fires_v2_*.csv.gz. Працюю в теці model/, Python + pandas.

Завдання зараз — гармонізація для України:
1. Помісячні суми по Україні окремо для Terra, Aqua, SNPP.
2. Коефіцієнт k_aqua(month) = SNPP / Aqua для кожного місяця року, навчання на 2012–2020. Так само k_terra(month) = SNPP / Terra. У зимові місяці точок мало — згладь (напр. медіана за роками або сезонний коефіцієнт) і поясни вибір.
3. Гармонізований ряд: 2000–2011 — MODIS, перерахований коефіцієнтами в шкалу SNPP (Terra й Aqua окремо, потім разом; до липня 2002 лише Terra); 2012+ — SNPP.
4. Запиши model/out/ukraine_monthly.csv: year, month, terra, aqua, snpp, modis_count, viirs_count, harmonized_count. Коефіцієнти — model/out/coefficients_ukraine.csv.
5. Скрипт має бути відтворюваним: python model/harmonize.py.

Перевірку точності (MAE, R²), календар і графіки робить Іван — домовся з ним про файл model/out/ukraine_monthly.csv. Коли буде grid_monthly світу — те саме за широтними поясами по 10° → grid_harmonized.csv. Гілка model/*, Pull Request у main.
```

## Іван — аналітик / валідація

```
Моя роль — аналітик / валідація у команді P1t0n. Прочитай CLAUDE.md, docs/RESEARCH_FIRMS.md і docs/ROLE_TASKS.md (мій розділ).

Дані: data/fires_v2_*.csv.gz і data/grid_monthly_UKR_v1.csv.gz. Моя тека — analysis/, Python + pandas + matplotlib. Графіки зберігай у docs/figures/ (PNG, англійські підписи — підуть на слайди).

Завдання зараз, по черзі:
1. Графік «сирі ряди» для України: помісячні кількості MODIS (Terra + Aqua) і Suomi NPP, 2000–2025. Має бути видно хибний стрибок 2012 року. → docs/figures/raw_series_ukraine.png
2. Місток NOAA-20 → SNPP: помісячне співвідношення NOAA20 / SNPP на 2018–2025 (спільні місяці), одне число + розкид. → analysis/out/bridge_noaa20.csv і короткий висновок.
3. Коли Єгор дасть model/out/ukraine_monthly.csv: MAE і R² на роках 2021–2025 (не тих, на яких він навчав коефіцієнти), графік «до / після» → docs/figures/harmonized_ukraine.png.
4. Календар за контрактом v2 для UKR і кожної області (region_id за правилом із CLAUDE.md; область — з колонки region у fires_v2): median_count — медіана harmonized_count того самого місяця за всі роки; anomaly — z-score. → analysis/out/calendar.csv
5. metrics.json за контрактом: mae, r2, viirs_reference, notes з обмеженнями.

Скрипти відтворювані: python analysis/<крок>.py. Гілка analysis/*, Pull Request у main.
```

## Михайло — фронтенд

```
Моя роль — фронтенд у команді P1t0n. Прочитай CLAUDE.md і frontend/public/data/README.md. Дані вже лежать у frontend/public/data/ (поки фейкові, той самий формат, що й справжні).

Завдання зараз — каркас сайту за 45 хвилин, щоб капітан задеплоїв:
1. Vite + JavaScript (або запропонуй інше, якщо є причина) у теці frontend/. Збірка — статичні файли, без сервера.
2. Модуль src/api.js — єдине місце, що читає дані: getRegions(), getCalendar(regionId), getTile(tile), getFires(month), getMetrics(), getManifest(). Сьогодні він читає файли з /data/..., пізніше можна перемкнути на API.
3. Сторінка: карта Leaflet + список зон із regions.json + календар-теплокарта «місяць × рік» для вибраної зони (harmonized_count). Якщо manifest.fake = true — плашка «Demo data».
4. Наверху: назва P1t0n, назва челенджу, посилання на репозиторій.
Pull Request одразу, як каркас збирається (npm run build), — далі покращуєш окремими PR.

Далі (див. docs/ROLE_TASKS.md): перемикач шарів MODIS / VIIRS / harmonized, рядок медіани й аномалії, кнопки CSV і PNG, шар сітки з плиток, прямокутник на карті → календар зони. Стиль — від Василини. Гілка frontend/*.
```

## Василина — дизайн / UX

```
Моя роль — дизайн / UX у команді P1t0n. Прочитай CLAUDE.md (розділи «Наш продукт», «Підказки по ролях — Дизайн») і frontend/public/data/README.md.

Завдання зараз — макет і дизайн-токени за 2 години:
1. Макет головного екрана: карта світу, вибір зони (список + прямокутник на карті), календар-теплокарта «місяць × рік» з рядком медіани, перемикач шарів MODIS / VIIRS / harmonized, кнопки CSV і PNG, плашка «Demo data», коротке пояснення «чому ряди не стикуються». Інструмент — на мій вибір; результат — PNG у frontend/design/.
2. frontend/design/tokens.css — CSS-змінні: кольори фону й тексту (темна тема), шрифти, відступи, кольорова шкала теплокарти з 7–9 кроків, читабельна при дальтонізмі (типу inferno), окремий колір для аномалії. Перевір контраст тексту.
3. Логотип P1t0n (SVG) — без символіки NASA. Якщо логотип чи картинку генерує ШІ — видимий водяний знак і рядок у docs/SI_USAGE_LOG.md.
Покажи макет Михайлу до 14:30. Гілка design/*, Pull Request у main.

Далі: допомога з версткою, шаблон 7 слайдів у стилі сайту, збірка слайдів і відео (розділ «Спільне» в docs/ROLE_TASKS.md).
```
