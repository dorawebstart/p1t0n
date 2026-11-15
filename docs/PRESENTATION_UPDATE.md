# Оновлення презентації і що зробити капітану — 15.11

Що тут:
- що змінити в поточній презентації «Harmonized Fire Calendar · Team P1t0n» (7 слайдів, перевірено 15.11);
- що додати після порад ментора;
- що зробити самому до подання.

Ментор сказав, що прогноз «буде ідеально й більше ніж достатньо». Прогноз уже зроблено, перевірено й злито: розділ **06 Outlook** на головній сторінці (https://dorawebstart.github.io/p1t0n/#outlook), розділ 3 нижче. Сайт тепер одна сторінка: старе `outlook.html` лише перенаправляє на `#outlook`.

---

## 1. Що в презентації вже добре — не чіпати

- 7 слайдів разом із титульним — у межах ліміту.
- На титульному: назва команди, 6 імен, челендж, сайт, QR.
- Числа збігаються з сайтом: ×3–3.7 / ×4.2–4.9, R² 0.95 / 0.86 / 0.16, +3.7 %, k 3.6–16.3, 26 % / 49 %, −63 % / +39 %, z = +3.8.
- Місток NOAA-20 позначено як «next» — чесно.
- Стиль сайту: темний фон, вогняні акценти, синій MODIS / помаранчевий VIIRS.

## 2. Що виправити

1. **Скріни в `.pptx` обрізані, але повні зображення всередині лишились.**
   - У повних скрінах видно вкладки браузера зі значками NASA, Gmail, закладки, фото профілю і панель задач.
   - Будь-хто може «скинути обрізку» в PowerPoint.
   - Логотипи NASA заборонені правилами.
   - Що зробити, один із варіантів:
     - **Публікувати лише PDF.** PDF показує тільки обрізану частину.
     - **PowerPoint:** клік на картинку → «Формат рисунка» → «Стиснути рисунки» → зняти «Застосувати лише до цього рисунка» → увімкнути «Видалити обрізані області рисунків» → OK.
     - **Найкраще:** переробити скріни в повноекранному режимі (F11, масштаб 100 %), без панелей браузера.
2. **Слайд 4, підпис «Aqua 10.2→8.1 · Terra 16.3→15.6 (scale 3.6–16.3)»** незрозумілий. Замінити на: `k ranges from 3.6 to 16.3 depending on month and satellite`.
3. **Слайд 4** — додати один рядок під формулою k: `Ratio of sums = maximum-likelihood estimate of k for Poisson counts`. Це головний аргумент для математиків.
4. **Слайд 5** — під `+3.7 %` замість «bias — stated openly» написати: `bias, mostly from Suomi NPP outages (Jul–Aug 2022, Jul 2024) — without them R² 0.98, bias −0.7 %`.
5. **Слайд 3 (Idea)** — показати ланцюжок із трьох кроків: `Harmonize → Burning calendar → Fire outlook`.
   - Шкала супутників лишається.
   - Унизу замість `one series 2000 → Oct 2026` написати: `one series 2000 → Oct 2026 → outlook for the next 12 months`.

## 3. Новий слайд — прогноз (головне, що просив ментор)

Щоб лишитись у межах 7 слайдів, **об'єднайте слайди 6 і 7** в один «Product and impact», а на місце 6 поставте прогноз.

### Слайд 6 — Fire outlook (новий)
- **Заголовок:** `Fire outlook: where fires are likely next`
- **Підзаголовок:** `A forecast for the next 12 months from 25 years of harmonized hotspots`
- **Головний візуал:** скрін карти з розділу **06 Outlook** головної сторінки (`#outlook`, місяць August) — світ, клітинки 1°, колір = ймовірність.
- **Формула** (моноширинним, крупно):
  ```
  p(c, m) = (Σ w·e + a·p₀) / (Σ w + a),   w = 0.5^((2025 − y)/h)
  ```
  Підпис: `probability of an active fire month (≥ 10 hotspots per 1° cell); recent years weigh more; Bayesian (Beta–Bernoulli) estimate`.
- **Три плитки з числами** (перевірено 15.11, 16:30, `frontend/public/data/outlook/metrics.json`):
  - `AUC 0.95` — tested on unseen 2021–2025 (half-life h = 3 years, prior a = 0.25)
  - `+41 %` — better than “same as last year”
  - `AUC 0.87` — real fires in Ukraine, Jan–Oct 2026 (forecast made from data to Dec 2025)
- **Малий візуал справа:** графік надійності зі сторінки (точки на діагоналі): `When we say 50–70 %, fire happened 57 % of the time (forecast 60 %)`.
- **Нотатка доповідача:** `Why the whole world and Ukraine for the proof? The forecast uses world 1° cells already summed from 515 million hotspots, so the whole planet takes minutes; checking it on 2026 needs individual hotspots, and NASA's 2026 world archive is not out yet — Ukraine 2026 we downloaded via the FIRMS API.`

### Слайд 7 — Product and impact (об'єднаний 6 + 7)
- **Заголовок:** `A burning calendar and outlook for any place on Earth`
- **Ліва половина:** скрін календаря (Ukraine, серпень 2008 вибраний) з трьома підписами: `Region — world, 227 countries, Ukraine, 27 oblasts` · `Harmonized / MODIS / VIIRS — before vs after` · `Download CSV / PNG`.
- **Права половина:**
  - `For: early-warning services · firefighters · researchers · land managers`
  - `Ukraine: two fire seasons — spring 26 %, July–August 49 %`
  - `2022–2025 vs 2012–2021: −63 % in most oblasts, +39 % in five frontline oblasts`
- **Унизу:** сайт + QR, `Data: NASA FIRMS (MODIS C6.1, VIIRS 375 m)`, `Code and data: github.com/dorawebstart/p1t0n`.
- **Прибрати:** скрін карти світу (карта — не головне, так сказав викладач) і `June 2026 z = +3.8` (дані попередні, а місце потрібне).

## 4. Відео ≤ 30 с — що змінити

| Час | Було | Стало |
|---|---|---|
| 0:20–0:25 | Клік на серпень 2008, Download CSV | **Прокрутка до розділу 06 Outlook** на тій самій сторінці: карта прогнозу, перемикання місяця. Субтитр: `And a fire outlook for the next 12 months — tested on real 2026 fires.` |
| 0:25–0:30 | Карта світу + адреса | Кінцевий титр з адресою: `For firefighters, early warning and science. dorawebstart.github.io/p1t0n` |

Решта таймінгу — як у `docs/PRESENTATION_BRIEF.md`. Фінальна тривалість — **≤ 30,0 с**.

## 5. Що зробити капітану (по порядку)

| # | Що | Де | Статус |
|---|---|---|---|
| 1 | ~~Подивитися сторінку прогнозу і злити PR~~ — злито | PR від Claude | ☑ |
| 1а | Перевірити розділ **06 Outlook** на живому сайті (https://dorawebstart.github.io/p1t0n/#outlook): кнопки місяців, карта, клік на клітинку, графіки — у приватному вікні й з телефона | живий сайт | ☐ |
| 2 | Передати Василині цей файл: слайди 3–7 і відео | — | ☐ |
| 3 | Перевірити, що в опублікованих слайдах немає повних скрінів із вкладками (розділ 2.1) | PowerPoint / PDF | ☐ |
| 4 | Опублікувати слайди (PDF) і відео за посиланням «усі, хто має посилання» — перевірити в приватному вікні | Google Drive / YouTube | ☐ до 20:00 |
| 5 | Дописати прогноз у Detailed Project Description — готовий абзац нижче | форма проєкту | ☐ |
| 6 | Вставити посилання на відео й слайди у форму, Link to Final Project = сайт | форма проєкту | ☐ |
| 7 | Submit for Judging + два чекбокси | форма проєкту | ☐ 22:30 |
| 8 | Після 23:55 нічого не зберігати | — | — |

**Абзац для Detailed Project Description** (вставити після розділу HOW IT WORKS):
```
FIRE OUTLOOK (FORECAST)
Because the record is one consistent series, we also forecast where fires are likely. For every 1° cell and month we estimate the probability of an active fire month (at least 10 hotspots on the Suomi NPP scale) as a recency-weighted Beta–Bernoulli posterior mean, p = (Σ w·e + a·p0) / (Σ w + a) with year weights w = 0.5^((2025 − y)/h). The half-life h and prior a were chosen on 2016–2020; on unseen years 2021–2025 the outlook reaches ROC AUC 0.95 and is 41 % better (Brier skill) than "same as last year". In a true forward test — forecast from data up to December 2025, compared with real Suomi NPP fires in Ukraine in January–October 2026 — it reaches AUC 0.87. Map: https://dorawebstart.github.io/p1t0n/#outlook
```
Числа — з `frontend/public/data/outlook/metrics.json` (перерахунок 15.11, 16:30).

## 6. Для Івана й Колі (захист прогнозу)

Повні відповіді — `docs/DEFENSE_PREP.md`, розділ «Прогноз». Коротко:
- **Що прогнозуємо:** ймовірність, що в клітинці 1° у цей місяць буде ≥ 10 точок пожеж.
- **Чому так:** це апостеріорне середнє Beta–Bernoulli моделі. Свіжі роки важать більше (півперіод h), а рідкісні клітинки підтягуються до середнього по світу (апріорне p₀).
- **Як перевірили:**
  1. параметри підібрано на 2016–2020;
  2. тест на 2021–2025;
  3. справжній тест на 2026 році в Україні.
- **Чесні межі:**
  - модель не бачить погоди;
  - кількість точок прогнозує гірше, ніж ймовірність;
  - світові дані — до 2025 року.
- **Наступний крок:** додати індекс пожежної небезпеки за погодою.
