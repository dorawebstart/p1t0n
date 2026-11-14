# NASA FIRMS — довідка для челенджу «Harmonization of MODIS and VIIRS Hot Spots»

Зібрано 14.11.2026 з офіційних сторінок NASA Earthdata і FIRMS (джерела в кінці).
Для команди P1t0n, «Жар-календар України».

---

## 0. Головне за 30 секунд

1. **Suomi NPP вимкнули 2 листопада 2026 о 13:00 UTC.** Нових даних VIIRS S-NPP більше не буде, архів лишається доступним. NASA радить переходити на **NOAA-20 і NOAA-21**: той самий сенсор VIIRS 375 м, та сама орбіта, проліт приблизно на 50 хвилин раніше.
2. **MODIS теж «доживає».** NASA офіційно радить переносити робочі процеси з MODIS на інші джерела. Terra зараз дає **єдиний ранковий проліт**, і заміни для нього ще немає. Тому гармонізація саме зараз критично потрібна: це довод для критерію Impact.
3. **Річні CSV по країні — це Standard Processing (науковий рівень якості) і містять поле `type`.** Отже, промислові джерела (`type = 2`) можна відфільтрувати. У NRT-даних цього поля немає.
4. **2026 року в річних CSV немає** (запит повертає 404). Дані за 2026 рік беремо через API з безкоштовним `MAP_KEY`.

---

## 1. Сенсори і періоди даних

| Сенсор | Супутник | Дані з | Дані до | Піксель | Проліт над екватором (місцевий час) |
|---|---|---|---|---|---|
| MODIS | Terra | 1 лис 2000 | досі | ~1 км | 10:30 / 22:30 |
| MODIS | Aqua | 4 лип 2002 | досі | ~1 км | 13:30 / 01:30 |
| VIIRS | Suomi NPP | 20 січ 2012 | **2 лис 2026** | 375 м | 13:30 / 01:30 |
| VIIRS | NOAA-20 (JPSS-1) | 1 квіт 2018 | досі | 375 м | ~12:40 / 00:40 |
| VIIRS | NOAA-21 (JPSS-2) | 17 січ 2024 | досі | 375 м | на 50 хв раніше за NOAA-20 |

- **MODIS:** смуга огляду 2330 км; на екваторі щонайменше 4 спостереження на добу (Terra + Aqua), у середніх широтах більше.
- **VIIRS:** смуга огляду 3040 км, глобальне покриття кожні 12 годин; у середніх широтах 3–4 прольоти на добу *на один супутник*.
- **Пропуски MODIS:** 15.04.2001, 15.06–03.07.2001, 19–28.03.2002. Повна таблиця пропусків є на FIRMS («missing data table»).
- **VIIRS 2012–2014:** у перші 18–24 місяці були «bad scan episodes», тобто хибні кластери пікселів упоперек смуги огляду. Їх виправили до 2015 року. **Ризик для гармонізації:** 2012–2013 роки можуть бути шумнішими.

### Що це означає для нас
- **Беремо лише один VIIRS-супутник (S-NPP).** Якщо додати NOAA-20 з 2018 року і NOAA-21 з 2024-го, кількість точок стрибне ще двічі, і це вийде той самий «хибний стрибок», з яким бореться челендж.
- **Беремо MODIS = Terra + Aqua разом.** До липня 2002 року працював лише Terra, тож 2000–2002 роки систематично занижені. Це варто згадати в `notes` або обрізати ряд з 07.2002. Рішення для ролі 3.
- **Для 2026 року після 2 листопада S-NPP вже немає.** Для поточного місяця потрібна заміна (NOAA-20) з окремим коефіцієнтом. Альтернатива — чесно сказати, що ряд S-NPP закінчується 02.11.2026.

---

## 2. Чому MODIS і VIIRS не можна порівнювати напряму

- **Роздільна здатність:** ~1 км проти 375 м. Одна точка — це центр пікселя, у якому є *принаймні одна* пожежа. Розмір і точне місце пожежі невідомі.
- **Чутливість:** MODIS стабільно бачить пожежі площею від ~1000 м²; за ідеальних умов і в 10 разів менші, у виняткових випадках навіть 50 м². VIIRS 375 м краще бачить малі пожежі й **краще працює вночі**.
- **Обидва пікселі ростуть до краю смуги огляду** (поля `scan` і `track` показують реальний розмір). VIIRS агрегує пікселі у 3 зонах: від надиру до 31.59°, 31.59–44.68°, 44.68–56.06°.
- **Час прольоту:** Terra ~10:30, Aqua і S-NPP ~13:30. Денний цикл горіння (аграрні підпали вдень) по-різному потрапляє в кадр.
- NASA пише, що VIIRS 375 м «show good agreement» з MODIS, але більша роздільність дає сильніший відгук на малі пожежі.

---

## 3. Поля CSV (перевірено на реальних файлах по Україні)

**MODIS** (`modis_YYYY_Ukraine.csv`):
```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
```
**VIIRS S-NPP** (`viirs-snpp_YYYY_Ukraine.csv`):
```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type
```

| Поле | MODIS | VIIRS | Примітка для pipeline |
|---|---|---|---|
| `satellite` | `Terra` / `Aqua` | `N` (S-NPP), `N20`, `N21` | |
| `confidence` | **0–100 %** | **`l` / `n` / `h`** | різні шкали, див. нижче |
| `version` | `61.03` (Collection 6.1) | `2` (Collection 2) | |
| `type` | 0 / 1 / 2 / 3 | 0 / 1 / 2 / 3 | лише в Standard/ML, у NRT поля немає |
| `daynight` | `D` / `N` | `D` / `N` | у Standard рахується за кутом Сонця (>85° — ніч) |
| `frp` | МВт | МВт | між сенсорами порівнювати обережно |
| `acq_time` | UTC, `HHMM` | UTC, `HHMM` | |

**`type`:** 0 — ймовірна пожежа рослинності, 1 — активний вулкан, 2 — **інше статичне наземне джерело** (промисловість, факели), 3 — офшор.
→ **Залишаємо лише `type = 0`.** Перший рядок у файлі MODIS 2024 — якраз `type = 2` біля 48.46° пн. ш., 38.78° сх. д. (Луганщина, промзона). Без фільтра такі точки «горітимуть» щомісяця.

**Confidence:**
- MODIS: класи low / nominal / high за значенням 0–100. Поширені пороги: <30 — low, 30–79 — nominal, ≥80 — high.
- VIIRS: `l` = слабка аномалія (<15 K) або сонячний відблиск удень; `n` = сильна аномалія (>15 K); `h` = насичений піксель.
- NASA: «оптимального порогу a priori не існує», значення може відрізнятися по регіонах. Для меншої кількості хибних тривог радять **залишати nominal + high**.
- **Пропозиція до контракту:** записувати `confidence` як `low` / `nominal` / `high` для обох сенсорів. Ця зміна контракту потребує згоди команди.

**FRP (Fire Radiative Power)** — це швидкість випромінювання енергії всіма пожежами в пікселі, у МВт; проксі інтенсивності. На FRP впливають роздільна здатність, температура насичення каналів, кут огляду і час прольоту. У VIIRS 375 м FRP надійне лише для малих і слабких пожеж; з 2015 року використовується гібрид із каналом M13 (750 м).

---

## 4. Standard (SP) і NRT: яку якість беремо

| | Standard / ML (науковий) | NRT (майже реальний час) |
|---|---|---|
| Затримка | 2–3 місяці | ≤3 години |
| Геолокація | найкраща; дані після маневрів супутника прибрані | зазвичай похибка <100 м, але після маневрів до кількох км (Aqua до 12 год) |
| Поле `type` | **є** | **немає** |
| Day/Night | за кутом Сонця | за висхідною чи низхідною орбітою |

- **Річні CSV по країні — це SP**: на сторінці FIRMS «Country Yearly Summary» прямо сказано «based on Standard Processing».
- NASA: для аналізу трендів і порівняння регіонів ще краще підходять **Level 2G** продукти, бо вони враховують хмарність і **перекриття орбіт, щоб не рахувати пожежу двічі**. Для хакатону вистачить ML/CSV, але це **обмеження варто чесно вписати в Validity**.
- **Лінійні смуги точок** бувають після калібрувальних маневрів (щомісяця супутник розвертають на Місяць). FIRMS їх фільтрує, але не завжди.

---

## 5. Як отримати дані

### 2000–2025: без ключа
```
https://firms.modaps.eosdis.nasa.gov/data/country/modis/{YYYY}/modis_{YYYY}_Ukraine.csv
https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/{YYYY}/viirs-snpp_{YYYY}_Ukraine.csv
https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/{YYYY}/viirs-jpss1_{YYYY}_Ukraine.csv   # NOAA-20
```
Розміри: MODIS ~0.9–1.3 МБ на рік, VIIRS S-NPP ~3–5 МБ на рік. Файли за 2026 рік повертають 404.

### 2026: через API (безкоштовний MAP_KEY)
```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{1..5}/{YYYY-MM-DD}
```
- Джерела `SOURCE`: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_*`.
- Прямокутник України приблизно: `22,44,40.3,52.4` (точки поза кордоном потім відсіче привʼязка до областей).
- **Максимум 5 днів за запит**; ліміт ключа — 5000 транзакцій за 10 хвилин. На 2026 рік це ~63 запити на сенсор.
- `/api/data_availability/csv/{MAP_KEY}/ALL` показує, по яку дату є SP, а з якої лише NRT.
- Ключ: https://firms.modaps.eosdis.nasa.gov/api/map_key/ (потрібна лише пошта).

---

## 6. Що вписати в Project Page

**NASA Data:**
- MODIS Collection 6.1 Active Fire (MCD14ML, Terra + Aqua), standard processing, 2000–2026, via NASA FIRMS country yearly summaries and FIRMS Area API.
- VIIRS 375 m Active Fire (VNP14IMGML, Suomi NPP), Collection 2, 2012–2026, via NASA FIRMS.
- *(якщо використаємо)* VIIRS NOAA-20 (VJ114IMG) для продовження ряду після 02.11.2026.

**Обовʼязкове посилання на джерело (вимога FIRMS):**
> We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) (https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System (ESDIS).

---

## 7. Висновки для гармонізації (передати ролі 3)

- **Аргумент для Impact:** S-NPP вимкнено, Terra й Aqua доживають. Без гармонізації 25-річний ряд пожеж обірветься або дасть хибний тренд. Саме це NASA і просить розвʼязати.
- **Обмеження для Validity, які варто чесно назвати:**
  - 2000–07.2002: лише Terra;
  - 2012–2014: шум VIIRS;
  - CSV/ML не враховують хмарність і подвійний підрахунок у перекритті орбіт;
  - різні шкали `confidence`;
  - FRP між сенсорами порівнювати обережно;
  - 2022+: зміна режиму горіння через війну.
- **Ідея для Creativity:** гармонізувати не лише кількість точок, а й поріг виявлення. Наприклад, перевірити, чи зближує ряди фільтр VIIRS за `frp` ≥ мінімуму, який бачить MODIS. Це цікава перевірка «чи пояснюється різниця малими пожежами».

---

## Джерела
- FIRMS на Earthdata: https://www.earthdata.nasa.gov/data/tools/firms
- FIRMS FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq
- Атрибути MODIS/VIIRS: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs
- Блог про вимкнення S-NPP (27.10.2026): https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know
- VIIRS 375 m: https://www.earthdata.nasa.gov/data/instruments/viirs/viirs-i-band-375-m-active-fire-data
- Country Yearly Summary: https://firms.modaps.eosdis.nasa.gov/country/
- FIRMS Area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- MODIS C6/C6.1 Fire User Guide: https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf
- VIIRS 375 m Active Fire User Guide: https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_User_Guide.pdf
