# Журнал використання ШІ (SI) — P1t0n

Навіщо: поле «Use of Super Intelligence (SI)» у формі подання й згадки в README. Правила — у `CLAUDE.md`, розділ «Правила SI».

Дописуйте рядок щоразу, коли ШІ допоміг із новою частиною роботи. Писати чесно й коротко.

| Дата | Хто | Інструмент | Для чого | Файли або матеріали | Позначено в проєкті? |
|---|---|---|---|---|---|
| 14.11 | Дорофєєв Ростислав | Claude Code | Зведення вимог гайдів і мануалу в контекст-файл, чеклист подання | `CLAUDE.md`, `docs/` | не потребує (внутрішні документи) |
| 14.11 | Дем'яненко Микола | Claude Code | Скрипти завантаження й очищення точок FIRMS, привʼязка до областей, довідка про дані NASA | `pipeline/`, `data/fires_v1*`, `data/regions.*` | так: шапка скриптів, `pipeline/README.md` |
| 14.11 | Дорофєєв Ростислав | Claude Code | Генератор фейкових даних для сайту, стартові промпти для команди | `backend/make_fake_data.js`, `frontend/public/data/`, `docs/START_PROMPTS.md` | так: шапка скрипта, `frontend/public/data/README.md` |
| 14.11 | Кніжницький Іван | Gemini | Перша версія скрипта «сирі ряди» | `analysis/step1_raw_series.py` | так: шапка скрипта |
| 14.11 | Дорофєєв Ростислав | Claude Code | Виправлення скрипта «сирі ряди» (фільтр супутників, річний графік) | `analysis/step1_raw_series.py`, `docs/figures/raw_series_ukraine*.png` | так: шапка скрипта, підпис на графіку |
| 14.11 | Крупіца Єгор | Claude Code | Скрипти гармонізації MODIS → Suomi NPP (Україна і сітка за широтними поясами), перевірка точності, чернетка опису методу | `model/harmonize.py`, `model/harmonize_grid.py`, `model/out/`, `model/README.md` | так: шапка скриптів, `model/README.md` |
| 14.11 | Крупіца Єгор (замість Івана) | Claude Code | Місток NOAA-20 → SNPP, перевірка точності, календар UKR + 27 областей, факти й тексти слайдів 2, 5, 6 | `analysis/bridge_noaa20.py`, `analysis/validate_harmonization.py`, `analysis/build_calendar.py`, `analysis/out/`, `docs/figures/bridge_noaa20.png`, `docs/figures/harmonized_ukraine.png`, `docs/FACTS_UKRAINE.md` | так: шапка скриптів, підписи на графіках |
| 14.11 | Дорофєєв Ростислав | Claude Code | Переробка сайту Михайла (дані з файлів, англійська, розділ Method, PNG/CSV), експорт справжніх даних, запуск світової гармонізації, `docs/MATH.md`, `docs/DEMO_SCRIPT.md` | `frontend/*.js`, `frontend/index.html`, `backend/export_static.py`, `docs/` | так: шапки файлів, розділ «How we built it» на сайті |
|  |  |  |  |  |  |

**Як позначати:**
- код і дані — рядок у README («Parts of the code were written with the assistance of …») і, де доречно, коментар у шапці файла;
- зображення й відео — видимий водяний знак на самому матеріалі;
- аудіо — згадка в описі й метаданих.

**Чого ШІ не робив:** ідею рішення, вибір підходу до гармонізації та висновки формулювала команда.
