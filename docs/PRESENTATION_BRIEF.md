# Бриф презентації для Василини — P1t0n

Один файл з усім для слайдів і відео: вимоги, текст кожного слайда, що на ньому показати і як він має виглядати.
Промт для ШІ (якщо збиратимеш слайди через Gamma, ChatGPT, Claude тощо) лежить окремо: `docs/PRESENTATION_AI_PROMPT.md`.

Сайт: https://dorawebstart.github.io/p1t0n/ · Репозиторій: https://github.com/dorawebstart/p1t0n

---

## 1. Що здаємо і до коли (час київський, 15.11)

| Що | Ліміт | Куди | Дедлайн |
|---|---|---|---|
| **Відео** | **≤ 30 секунд**, англійські субтитри | поле *Link to Project Demo* (YouTube «Unlisted» або Google Drive «усі, хто має посилання») | **20:00** готове й перевірене |
| **Слайди** | **≤ 7 слайдів**, разом із титульним | посилання в *Detailed Project Description* + показ на захисті 17–18.11 | **20:00** |
| Перше подання форми (капітан) | — | spaceappschallenge.org | 22:30 |
| Останні правки | — | — | **23:55**, після цього нічого не чіпаємо |

Перевищення ліміту (31 секунда або 8 слайдів) означає, що проєкт не допустять до глобального журі. Тому 7 слайдів — це стеля, а не план «приблизно».

## 2. Обов'язкові правила (за гайдом NASA)

- **Усе англійською**: текст на слайдах, субтитри. Озвучка може бути українською, але тоді англійські субтитри обов'язкові.
- **Без логотипів, прапорів та емблем NASA і місій NASA** (Terra, Aqua, Suomi NPP, VIIRS, MODIS — лише текстом, без їхніх значків).
- **Без людей до 18 років** на фото, у відео й у голосі.
- **Без чужих картинок без дозволу.** Беремо лише скріни нашого сайту, наші графіки (`docs/figures/`), іконки з відкритою ліцензією (Tabler, Lucide).
- **Зображення чи відео, згенеровані ШІ, — з видимим водяним знаком**, наприклад «AI-generated» у кутку. Скріни сайту й графіки з наших даних — не ШІ, знак не потрібен.
- **Посилання на слайди і відео відкриваються без входу** в акаунт. Перевір у приватному вікні й з телефона.
- На титульному: назва команди, імена учасників, назва челенджу.

## 3. Головна думка (для всіх слайдів)

> 25 years of NASA fire satellites, put on one scale. MODIS and VIIRS count the same fires differently. We translate MODIS into the Suomi NPP VIIRS scale and show a burning calendar for any place on Earth.

Порада викладача: **карта не головне**. Головне — проблема, математика і доказ, що метод працює. Тому найбільше місця віддаємо слайдам 2–5, а карта — лише маленький скрін на слайді 6.

## 4. Слайди: текст і що показати

Текст на слайді — не більше ~30 слів. Решту говорять Іван і Коля (їхній текст — у `docs/DEFENSE_PREP.md`).

### Слайд 1 — Title
- **Заголовок:** `Harmonized Fire Calendar`
- **Підзаголовок:** `25 years of NASA fire satellites on one scale`
- **Рядок:** `Team P1t0n · NASA Space Apps Challenge 2026 · Dnipro`
- **Челендж:** `Challenge: Harmonization of MODIS and VIIRS Hot Spots`
- **Учасники:** Rostyslav Dorofieiev, Mykola Demianenko, Yehor Krupitsa, Mykhailo Revuzhenko, Vasylyna Kutsa, Ivan Knizhnytskyi *(звір написання латиницею з профілями на сайті Space Apps)*
- **Внизу:** адреса сайту + QR-код на https://dorawebstart.github.io/p1t0n/
- **Візуал:** скрін першого екрана сайту (сфера з точками пожеж) на весь фон, затемнений.

### Слайд 2 — Problem
- **Заголовок:** `Two instruments, two different counts`
- **Текст:**
  - `MODIS (Terra, Aqua) since 2000 · 1 km pixel · retiring`
  - `VIIRS since 2012 · 375 m pixel · sees 3–5× more hotspots`
  - `Suomi NPP stopped new data on 2 Nov 2026`
  - `Joined as is → a false jump in 2012`
- **Візуал:** графік річних сум України: синє — MODIS, помаранчеве — VIIRS (`docs/figures/raw_series_ukraine.png` або скрін 3D-графіка з розділу Problem на сайті). Стрілка на 2012 рік із підписом `false jump`.
- **Число великим шрифтом:** `×3–3.7` (Ukraine) / `×4.2–4.9` (World) — у стільки разів VIIRS бачить більше за рік (`frontend/public/data/raw_series.json`).

### Слайд 3 — Idea
- **Заголовок:** `Translate MODIS to the VIIRS scale`
- **Текст:** `On the years both instruments flew (2012–2020), we measure how many VIIRS hotspots match one MODIS hotspot — per month and per latitude band. Then we translate 2000–2011.`
- **Візуал — шкала часу супутників** (намалювати самій, прості смуги):
  - Terra MODIS — 2000 → сьогодні (сіро-синя)
  - Aqua MODIS — 2002 → сьогодні (синя)
  - Suomi NPP VIIRS — 2012 → **2 Nov 2026** (помаранчева, обрізана; позначка «stopped»)
  - NOAA-20 VIIRS — 2018 → (помаранчева світліша; підпис `next: bridge, ratio 1.03`) — місток пораховано, але в ряд ще не вбудовано, тому «next», а не «done»
  - Підсвітити зону 2012–2020 як `training overlap`, 2021–2025 як `test`.
- Унизу стрілка: `one series 2000 → Oct 2026`.

### Слайд 4 — Math
- **Заголовок:** `The method in three formulas`
- **Формули** (крупно, моноширинним шрифтом або гарними формулами):
  1. `k(m) = Σ N_SNPP(y,m) / Σ N_MODIS(y,m),  y = 2012…2020`
  2. `H = w·k_Aqua·N_Aqua + (1−w)·k_Terra·N_Terra,  w = N_Aqua / (N_Aqua + N_Terra)`
  3. `z = (H − median) / σ`  — anomaly of a month
- **Підпис:** `Terra and Aqua get separate coefficients: they pass at 10:30 and 13:30 local time.`
- **Візуал:** стовпчиковий графік `k_Aqua` і `k_Terra` за 12 місяцями (Україна). Дані:

| Month | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| k_Aqua | 10.2 | 6.0 | 3.9 | 4.8 | 8.8 | 12.8 | 9.7 | 8.9 | 5.8 | 3.6 | 4.3 | 8.1 |
| k_Terra | 16.3 | 16.0 | 7.6 | 6.4 | 8.4 | 9.7 | 5.9 | 6.8 | 6.7 | 6.4 | 12.4 | 15.6 |

  Або скрін картки з коефіцієнтами з розділу Method на сайті.

### Слайд 5 — Proof
- **Заголовок:** `Tested on years the model never saw`
- **Текст:** `Trained 2012–2020 · tested 2021–2025 (60 months)`
- **Великі числа (3 плитки):**
  - `R² 0.95` — Ukraine (raw MODIS: 0.16)
  - `R² 0.86` — World
  - `+3.7 %` — bias, stated openly
- **Візуал:** скрін картки *Validation on unseen years* із сайту (лінії: справжній Suomi NPP, перерахований MODIS, сирий MODIS) або `docs/figures/harmonized_ukraine.png`.

### Слайд 6 — Product
- **Заголовок:** `A burning calendar for any place on Earth`
- **Візуал (головне):** великий скрін календаря з сайту — Ukraine, теплокарта «місяць × рік», виділений серпень 2008, праворуч панель із медіаною і z.
- **Підписи-виноски до кнопок** (тонкі лінії від підпису до кнопки на скріні):
  - `Region` — world, 227 countries, Ukraine, 27 oblasts
  - `Harmonized / MODIS / VIIRS` — before vs after
  - `Anomalies only` — months with |z| > 2
  - `Download CSV / PNG`
- **Малий скрін карти** в куті (клітинки 1° світу) з підписом `World map, 1° cells`.

### Слайд 7 — Ukraine and impact
- **Заголовок:** `What it shows — and who needs it`
- **Факти про Україну (з даних, без причин):**
  - `Two seasons: spring (26 %) and July–August (49 %)`
  - `2022–2025 vs 2012–2021: −63 % in most oblasts, +39 % in five frontline oblasts`
  - `June 2026: z = +3.8 (preliminary data)`
- **Для кого:** `early-warning services · firefighters · researchers · land managers`
- **Внизу:** адреса сайту, QR, `Data: NASA FIRMS (MODIS C6.1, VIIRS 375 m)`, `Code: github.com/dorawebstart/p1t0n`.

## 5. Відео до 30 секунд (поле Link to Project Demo)

Таймінг за гайдом NASA. Монтаж зі скрінкасту сайту (запис екрана, 1920×1080), без людей у кадрі. Субтитри англійською, великі, внизу.

| Час | Кадр | Субтитр |
|---|---|---|
| 0:00–0:02 | Титр на темному фоні: логотип `P1t0n` | `Team P1t0n · Dnipro` |
| 0:02–0:05 | 3D-графік Problem, стрибок 2012 | `MODIS and VIIRS count the same fires differently.` |
| 0:05–0:10 | Перший екран сайту з назвою | `Harmonized Fire Calendar — 25 years on one scale.` |
| 0:10–0:15 | Розділ Method: формула k і картка Validation | `We translate MODIS into the VIIRS scale. Tested on unseen years: R² 0.95.` |
| 0:15–0:20 | Календар: вибір Ukraine, перемикач Harmonized → MODIS → Harmonized | `Pick any region and dates. The 2012 jump is gone.` |
| 0:20–0:25 | Клік на серпень 2008 → панель z; кнопка Download CSV | `See anomalies against the historical median. Download the data.` |
| 0:25–0:30 | Карта світу, наближення до Африки; кінцевий титр з адресою | `For firefighters, early warning and science. dorawebstart.github.io/p1t0n` |

Музика — лише з ліцензією (наприклад, бібліотека YouTube Audio Library або Mixkit), назву треку записати в References. Тривалість фінального файлу перевірити: **≤ 30,0 с**.

## 6. Як має виглядати (стиль сайту)

Слайди мають виглядати як продовження сайту.

**Кольори**

| Роль | Колір |
|---|---|
| Фон | `#06070a` (майже чорний), можна м'який радіальний відсвіт `#190d0a` у правому верхньому куті |
| Основний акцент (вогонь) | `#ff5e2b` |
| Другий акцент | `#ff9e44` |
| Текст основний | `#f8fafc` |
| Текст другорядний | `#94a3b8` |
| Підписи, рамки | `#64748b` |
| MODIS на графіках | `#0072B2` (синій) |
| VIIRS на графіках | `#E69F00` (помаранчевий) |
| Теплокарти | шкала **inferno** (від темно-фіолетового до жовтого) |

Синій і помаранчевий — пара, яку розрізняють люди з дальтонізмом. Червоний із зеленим поруч не ставити.

**Шрифти** (усі безкоштовні, Google Fonts)
- Заголовки — **Playfair Display**, жирний 800–900.
- Текст — **Inter**, 400–500.
- Числа, формули, підписи осей, «бейджі» — **JetBrains Mono**.

**Макет**
- Формат 16:9.
- Поля ≥ 6 % ширини; заголовок угорі зліва; один головний візуал на слайд.
- Великі числа (R², ×3–3.7) — 72–96 pt, моноширинним, кольором `#ff9e44`.
- Картки з напівпрозорим темним фоном і тонкою рамкою `#64748b` на 30 %, кути заокруглені ~16 px (як на сайті).
- Внизу кожного слайда дрібним сірим: `P1t0n · NASA Space Apps 2026` і номер `n/7`.
- Мінімальний розмір тексту — 20 pt, щоб читалося в Zoom.

**Скріни сайту**: Chrome, масштаб 100 %, вікно 1920×1080, клавіша F11 (без панелей браузера). Календар — Region = Ukraine, клік на серпень 2008. Validation — перемикач Ukraine.

## 7. Перевірка перед здачею

- [ ] Слайдів ≤ 7, відео ≤ 30 с (подивитися тривалість у властивостях файлу)
- [ ] Усе англійською, субтитри є
- [ ] Немає логотипів NASA, немає людей до 18 років
- [ ] На ШІ-картинках водяний знак
- [ ] Посилання на слайди й відео відкриваються у приватному вікні без входу
- [ ] Числа збігаються з сайтом: R² 0.95 / 0.86 / 0.16, +3.7 %, z 3.8 (червень 2026), ×3–5
- [ ] Посилання скинуто капітану до 20:00

Джерела чисел: `frontend/public/data/metrics.json`, `docs/MATH.md`, `docs/FACTS_UKRAINE.md`.
