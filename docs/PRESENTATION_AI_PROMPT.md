# Промт для ШІ: зібрати слайди P1t0n

Як користуватись: скопіюй усе між лініями в Gamma / ChatGPT / Claude / Canva Magic Design. Скріни сайту й графіки (`docs/figures/`) додай сама. Повний бриф із поясненнями — `docs/PRESENTATION_BRIEF.md`.
Після генерації звір кожне число з брифом: ШІ любить «округлювати» й вигадувати.

---

```
You are a presentation designer. Build a 7-slide deck (16:9) in English for a NASA International Space Apps Challenge 2026 project. HARD LIMIT: exactly 7 slides including the title slide — never more.

PROJECT
Team: P1t0n (local event: Dnipro, Ukraine).
Challenge: "Harmonization of MODIS and VIIRS Hot Spots".
Product: "Harmonized Fire Calendar" — a website that puts 25 years of NASA FIRMS active-fire hotspots (MODIS since 2000, VIIRS since 2012) on one scale and shows a burning calendar (month × year heat map) for any region on Earth, with anomalies against the historical median and CSV/PNG downloads.
Website: https://dorawebstart.github.io/p1t0n/  Code: https://github.com/dorawebstart/p1t0n
Team members: Rostyslav Dorofieiev, Mykola Demianenko, Yehor Krupitsa, Mykhailo Revuzhenko, Vasylyna Kutsa, Ivan Knizhnytskyi.

RULES (must follow)
- All text in English. Max ~30 words of body text per slide; the speakers say the rest.
- Do NOT use any NASA logo, NASA mission emblem or flag. Satellite and instrument names only as text.
- No photos of people. No stock images of fire or firefighters.
- Any AI-generated image must carry a visible "AI-generated" watermark in a corner. Prefer no generated images at all: use simple shapes, charts and placeholders for screenshots.
- Use ONLY the numbers given below. Do not invent, round differently or add statistics.

STYLE (match the website)
- Background #06070a (near black), optional soft radial glow #190d0a in the top-right corner.
- Accent "ember" #ff5e2b, second accent #ff9e44. Main text #f8fafc, secondary text #94a3b8, hairlines #64748b at 30% opacity.
- Charts: MODIS = #0072B2 (blue), VIIRS = #E69F00 (orange) — colour-blind safe pair. Heat maps: inferno colour scale.
- Fonts: titles Playfair Display 800–900; body Inter 400–500; numbers, formulas, labels JetBrains Mono.
- Cards: dark translucent panels, thin border, 16 px rounded corners. Big numbers 72–96 pt in JetBrains Mono, colour #ff9e44.
- Footer on every slide, small grey: "P1t0n · NASA Space Apps 2026" and "n/7". Minimum text size 20 pt.

SLIDES
1. Title — "Harmonized Fire Calendar"; subtitle "25 years of NASA fire satellites on one scale"; "Team P1t0n · NASA Space Apps Challenge 2026 · Dnipro"; "Challenge: Harmonization of MODIS and VIIRS Hot Spots"; the six team member names; website URL and a placeholder for a QR code. Background: placeholder for a darkened screenshot of the website hero (a globe of fire dots).

2. Problem — title "Two instruments, two different counts". Bullets: "MODIS (Terra, Aqua) since 2000 · 1 km pixel · retiring"; "VIIRS since 2012 · 375 m pixel · sees 3–5× more hotspots"; "Suomi NPP stopped new data on 2 Nov 2026"; "Joined as is → a false jump in 2012". Big numbers: "×3–3.7 Ukraine", "×4.2–4.9 World". Visual: placeholder for a yearly bar chart (blue MODIS, orange VIIRS) with an arrow at 2012 labelled "false jump".

3. Idea — title "Translate MODIS to the VIIRS scale". Text: "On the years both instruments flew (2012–2020), we measure how many VIIRS hotspots match one MODIS hotspot — per month and per latitude band. Then we translate 2000–2011." Visual: a satellite timeline drawn as horizontal bars: Terra MODIS 2000→now; Aqua MODIS 2002→now; Suomi NPP VIIRS 2012→2 Nov 2026 (marked "stopped"); NOAA-20 VIIRS 2018→now (labelled "next: bridge, ratio 1.03"). Shade 2012–2020 "training overlap" and 2021–2025 "test". Arrow below: "one series 2000 → Oct 2026".

4. Math — title "The method in three formulas". Show large, in monospace:
   k(m) = Σ N_SNPP(y,m) / Σ N_MODIS(y,m),  y = 2012…2020
   H = w·k_Aqua·N_Aqua + (1−w)·k_Terra·N_Terra,  w = N_Aqua / (N_Aqua + N_Terra)
   z = (H − median) / σ
   Caption: "Terra and Aqua get separate coefficients: they pass at about 10:30 and 13:30 local time."
   Chart: grouped bars of the monthly coefficients for Ukraine, months 1–12:
   k_Aqua  = 10.2, 6.0, 3.9, 4.8, 8.8, 12.8, 9.7, 8.9, 5.8, 3.6, 4.3, 8.1
   k_Terra = 16.3, 16.0, 7.6, 6.4, 8.4, 9.7, 5.9, 6.8, 6.7, 6.4, 12.4, 15.6

5. Proof — title "Tested on years the model never saw". Text: "Trained 2012–2020 · tested 2021–2025 (60 months)". Three number tiles: "R² 0.95 — Ukraine (raw MODIS: 0.16)"; "R² 0.86 — World"; "+3.7 % bias — stated openly". Visual: placeholder for a line chart: real Suomi NPP vs translated MODIS vs raw MODIS, monthly 2021–2025.

6. Product — title "A burning calendar for any place on Earth". Main visual: large placeholder for a screenshot of the calendar heat map (Ukraine, August 2008 selected, side panel with median and z). Callouts with thin leader lines: "Region — world, 227 countries, Ukraine, 27 oblasts"; "Harmonized / MODIS / VIIRS — before vs after"; "Anomalies only — months with |z| > 2"; "Download CSV / PNG". Small corner placeholder: "World map, 1° cells".

7. Ukraine and impact — title "What it shows — and who needs it". Facts: "Two seasons: spring (26 %) and July–August (49 %)"; "2022–2025 vs 2012–2021: −63 % in most oblasts, +39 % in five frontline oblasts"; "June 2026: z = +3.8 (preliminary data)". Audience: "early-warning services · firefighters · researchers · land managers". Bottom: website URL, QR placeholder, "Data: NASA FIRMS (MODIS C6.1, VIIRS 375 m)", "Code: github.com/dorawebstart/p1t0n".

Also give me speaker notes (2–3 sentences per slide, English) and check at the end that the deck has exactly 7 slides and no NASA logos.
```

---

## Промт для відео (якщо монтуєш через ШІ-редактор)

```
Edit a screen recording of the website https://dorawebstart.github.io/p1t0n/ into a video of AT MOST 30.0 seconds, 1920×1080, English subtitles burned in (large, bottom centre, white on a dark translucent band). No people, no NASA logos, licensed music only, quiet. Shots and subtitles:
0:00–0:02 title card "P1t0n" on #06070a — "Team P1t0n · Dnipro"
0:02–0:05 3D chart of yearly hotspots with the 2012 jump — "MODIS and VIIRS count the same fires differently."
0:05–0:10 website hero with the title — "Harmonized Fire Calendar — 25 years on one scale."
0:10–0:15 Method section: formula and validation chart — "We translate MODIS into the VIIRS scale. Tested on unseen years: R² 0.95."
0:15–0:20 calendar: choose Ukraine, toggle Harmonized → MODIS → Harmonized — "Pick any region and dates. The 2012 jump is gone."
0:20–0:25 click August 2008, side panel with z, click Download CSV — "See anomalies against the historical median. Download the data."
0:25–0:30 world map zooming into Africa, end card with the URL — "For firefighters, early warning and science. dorawebstart.github.io/p1t0n"
If any shot is AI-generated, add a visible "AI-generated" watermark.
```
