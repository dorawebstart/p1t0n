# P1t0n — Harmonized Fire Calendar

**NASA Space Apps Challenge 2026 · Local Event: Dnipro · Challenge: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)**

- **Live site:** https://dorawebstart.github.io/p1t0n/
- **Team page:** https://www.spaceappschallenge.org/2026/find-a-team/p1t0n/
- **Code:** this repository (static site in `frontend/`, data pipeline in `pipeline/`, `model/`, `analysis/`, `backend/`)

## The problem

NASA satellites have recorded active fires since 2000, but the record is split between two generations of instruments:

- **MODIS** on Terra and Aqua, since 2000, ~1 km pixels. These satellites are reaching the end of their mission.
- **VIIRS**, its successor, ~375 m pixels, on Suomi NPP (2012), NOAA-20 (2018) and NOAA-21 (2023). For the same fires it detects 3–5 times more hotspots than Terra and Aqua together (Ukraine 2.9–3.7×, world 4.2–4.9× per year), and more VIIRS satellites mean even more detections. FIRMS stopped producing new Suomi NPP data on 2 November 2026.

Adding the archives together produces a false jump in fire activity in 2012.

## What the site does

One consistent **burning activity calendar**, November 2000 – October 2026, on the Suomi NPP VIIRS scale:

- **Burning calendar** (month × year heat map) for 256 ready-made regions: the world, 227 countries, Ukraine and its 27 oblasts; historical median of each month, z-score anomalies, 25–75 % expected range, noise estimate.
- **Series switch:** harmonized / raw MODIS / raw VIIRS — the calendar and the map change together, so the effect of harmonization is visible.
- **Date range** by month; **CSV and PNG download** of the calendar.
- **World map** of 1° cells (the harmonization runs on a 0.25° grid; the map sums it into 1° cells), 2000–2025, three layers; click a cell for its numbers.
- **Ukraine points:** individual MODIS and VIIRS hotspots for the months of 2026, with CSV download.
- **Method and accuracy** published on the page: coefficients, validation on unseen years, limitations.

Not implemented yet: drawing a custom area or typing coordinates (regions are chosen from the list); individual hotspot files for years before 2026; the NOAA-20 continuation after Suomi NPP (the ratio is measured, see below).

## Method and accuracy

For every calendar month `m` (and, for the world, every 10° latitude band), on the years when both instruments flew (2012–2020):

```
k_Aqua(m)  = Σ SNPP(y,m) / Σ Aqua(y,m)        k_Terra(m) = Σ SNPP(y,m) / Σ Terra(y,m)
H = w·k_Aqua·Aqua + (1−w)·k_Terra·Terra,      w = Aqua / (Aqua + Terra)      (Nov 2000 – Jan 2012)
H = Suomi NPP                                                                (Feb 2012 – Oct 2026)
median M(m) over all years,   z = (H − M) / σ   (σ: sample SD of the same month over all years)
```

- The ratio of sums is the maximum-likelihood estimate of `k` for Poisson counts `SNPP ~ Poisson(k · MODIS)`.
- Terra and Aqua are scaled separately because they pass at about 10:30 and 13:30 local time; the two translated estimates are averaged with weights proportional to their counts.
- Only one VIIRS satellite (Suomi NPP) is the reference, so that new satellites do not inflate counts.
- NOAA-20 / Suomi NPP over 2018–2025: sum ratio 1.033, monthly median 1.007. This bridge will continue the series after 2 November 2026; it is measured but not yet applied.

Tested on years the model never saw (2021–2025, 60 monthly totals):

| | R² | MAE (hotspots / month) | bias |
|---|---|---|---|
| Ukraine, raw MODIS vs Suomi NPP | 0.16 | 3,007 | −70.9 % |
| **Ukraine, harmonized MODIS vs Suomi NPP** | **0.95** | 593 | +3.7 % |
| **World, harmonized MODIS vs Suomi NPP** | **0.86** | 107,647 | +0.1 % |

Limitations:

- Counts are not normalized for observing days. Suomi NPP outages (late July – early August 2022, July 2024) look like low-fire months; without those three test months Ukraine reaches R² 0.98 and bias −0.7 %.
- `k` is assumed stable over time; Terra's orbit drift after ~2022 makes recent errors larger (WAPE 11.8 % in 2021–23 vs 15.9 % in 2024–25).
- Winter months before 2012 have few MODIS detections × large coefficients, so they are noisy (relative noise ≈ 1/√N or more).
- Fire size, FRP, scan angle, day/night and clouds are not modelled separately; they are absorbed into `k`.
- 2026 data are near-real-time and preliminary.

More detail: [`model/README.md`](model/README.md) (English section "Method"). Team notes in Ukrainian: `docs/MATH.md`, `docs/DEFENSE_PREP.md`.

## Data

- **NASA FIRMS** — https://firms.modaps.eosdis.nasa.gov/ — MODIS Collection 6.1 (MCD14/MOD14/MYD14) and VIIRS 375 m (VNP14IMG Suomi NPP, VJ114IMG NOAA-20) active fire products. Yearly standard-processing (SP) archives for the world and per country, 2000–2025 (515,029,947 hotspots, `type = 0` only); 2026 near-real-time data via the FIRMS API.
- Country boundaries — Natural Earth; Ukrainian oblast boundaries — geoBoundaries (ODbL).

## Repository layout

| Folder | Contents |
|---|---|
| `pipeline/` | Node.js: download FIRMS archives, aggregate to the 0.25° grid (`grid_monthly`), Ukraine hotspots table (`fires`), cell → country lookup |
| `model/` | Python: harmonization coefficients and harmonized cells (`harmonize.py` Ukraine, `harmonize_grid.py` world), metrics |
| `analysis/` | Raw series, NOAA-20 bridge ratio, validation, calendar statistics |
| `backend/` | `export_static.py`: writes the static JSON files the site reads |
| `frontend/` | The web application (plain HTML/CSS/JS, Leaflet, three.js) and its data in `public/data/` |
| `data/` | Small derived files: Ukraine hotspots, Ukraine grid, oblast boundaries |
| `docs/` | Team documents (mostly Ukrainian) |

## Reproduce

Node.js 18+ (no npm packages) and Python 3 with `pip install -r requirements.txt`.

```bash
node pipeline/01_download.js              # Ukraine yearly CSVs (MODIS, Suomi NPP, NOAA-20) + oblast boundaries
node pipeline/03_fetch_2026.js            # 2026 via the FIRMS API (needs FIRMS_MAP_KEY in .env, see .env.example)
node pipeline/02_build_fires.js           # → fires table (Ukraine)
node pipeline/05_grid_monthly.js ukraine  # → grid_monthly for Ukraine
node pipeline/04_download_world.js        # world archives, ~10 GB
node pipeline/05_grid_monthly.js watch    # → grid_monthly for the world
node pipeline/06_cell_country.js          # → cell_country (cell → country → oblast)
python model/harmonize.py                                                   # Ukraine coefficients
python model/harmonize_grid.py --input <grid_monthly world .csv.gz> --tag world   # → model/out/grid_harmonized_world.csv.gz
python analysis/step1_raw_series.py && python analysis/bridge_noaa20.py && python analysis/validate_harmonization.py && python analysis/build_calendar.py
python backend/export_static.py --world-grid model/out/grid_harmonized_world.csv.gz --cell-country <cell_country.csv>
python -m http.server 8000 --directory frontend                             # open http://localhost:8000
```

> ⚠️ `backend/export_static.py` rebuilds `frontend/public/data` from scratch. Run it **with** `--world-grid` and `--cell-country`; without them it writes Ukraine only and the world view disappears.

The world grid (`grid_monthly_v1.csv.gz`, 156 MB) and `cell_country.csv` are too large for git; they are shared on Google Drive (links in `pipeline/README.md`) or can be rebuilt with the commands above.

## Use of AI (Super Intelligence)

Parts of the code, data-processing scripts and documentation were written with the help of AI coding assistants (Claude Code by Anthropic, Google Gemini). The project idea, the choice of method, the validation design and the conclusions are the team's own. AI-assisted files say so in their header; the log is in `docs/SI_USAGE_LOG.md`. No AI-generated images or videos are used on the site.

## References

Data
- NASA FIRMS (Fire Information for Resource Management System), MODIS C6.1 and VIIRS 375 m active fire data — https://firms.modaps.eosdis.nasa.gov/
- Natural Earth, Admin 0 country boundaries (public domain) — https://www.naturalearthdata.com/
- geoBoundaries, Ukraine ADM1 (ODbL). Runfola, D. et al. (2020) geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866 — https://www.geoboundaries.org/

Map and libraries
- Leaflet 1.9.4 (BSD-2-Clause) — https://leafletjs.com/, served from unpkg.com
- three.js r128 (MIT) — https://threejs.org/, served from cdnjs.cloudflare.com
- OpenStreetMap tiles and data © OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright
- pandas, NumPy, Matplotlib (BSD-style licences) — data processing and figures
- Node.js standard library — pipeline

Fonts and design
- Inter, JetBrains Mono, Playfair Display — Google Fonts, SIL Open Font License
- Motion studies "Tab pill", "Segmented control", "Magnetic button", "Weight wave", "Scramble text" — designbookmark.com/motion; rebuilt in plain JavaScript in our colours
- Colour scales: inferno (matplotlib, CC0) and the Okabe–Ito colour-blind-safe pair for MODIS / VIIRS

Science
- Giglio, L., Schroeder, W., Justice, C. O. (2016) The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014) The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. Remote Sensing of Environment 143, 85–96.
- NASA Earthdata (2026) Transitioning from Suomi NPP VIIRS/OMPS: what FIRMS users need to know — https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know

## Team

Rostyslav Dorofieiev (captain, backend, deploy) · Mykola Demianenko (data engineering) · Yehor Krupitsa (harmonization) · Mykhailo Revuzhenko (frontend) · Vasylyna Kutsa (design) · Ivan Knizhnytskyi (analysis, validation)

## License

Code: MIT (see [LICENSE](LICENSE)). Oblast boundaries derived from geoBoundaries: ODbL. NASA FIRMS data: NASA open data policy.
