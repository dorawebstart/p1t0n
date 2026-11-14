# P1t0n — Harmonized Fire Calendar of the Planet

**NASA Space Apps Challenge 2026 · Local Event: Dnipro · Challenge: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)**

> Work in progress during the hackathon (14–15 November 2026).

- **Live site:** https://dorawebstart.github.io/p1t0n/
- **Mirror:** TODO
- **Demo video (≤ 30 s):** TODO
- **Team page:** https://www.spaceappschallenge.org/2026/find-a-team/p1t0n/

## The problem

NASA satellites have recorded active fires since 2000, but the record is split between two generations of instruments:

- **MODIS** on Terra and Aqua, since 2000, ~1 km pixels. These satellites are reaching the end of their mission.
- **VIIRS**, its successor, ~375 m pixels, on Suomi NPP (2012), NOAA-20 (2018) and NOAA-21 (2023). It detects several times more hotspots for the same fires, and more VIIRS satellites mean even more detections. FIRMS stopped producing new Suomi NPP data on 2 November 2026; NOAA-20 and NOAA-21 carry the record forward.

Adding the archives together produces a false jump in fire activity after 2012. Without harmonization, 25 years of global fire history cannot be compared with what VIIRS sees today.

## What we build

A web application that harmonizes MODIS and VIIRS hotspots from NASA FIRMS into one consistent **burning activity calendar for any area on Earth**, 2000–2026:

- global map with MODIS / VIIRS / harmonized layers on a 0.25° grid;
- area of interest: a country, a predefined region, or a rectangle drawn on the map;
- month × year heat map with the historical median and anomalies;
- date range selection and CSV / PNG download;
- published accuracy of the harmonization (MAE, R², globally and for Ukraine) and its limitations.

**Showcase: Ukraine.** Detailed hotspots by oblast: seasonal agricultural burning, forest fires, and changes in burning regime in frontline regions compared with 2012–2021.

## Data

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS Collection 6.1 and VIIRS 375 m active fire products (Suomi NPP, NOAA-20, NOAA-21).
- Other sources and libraries are listed in [References](#references).

## Repository layout

| Folder | Contents |
|---|---|
| `pipeline/` | Download of FIRMS hotspots, aggregation to the global grid, Ukraine hotspots table |
| `model/` | Harmonization, monthly calendar, accuracy metrics |
| `backend/` | API / static data export for the site |
| `frontend/` | Web application |
| `data/` | Small derived data files and their description |
| `docs/` | Team documents and submission materials |

## Method and accuracy

For every calendar month `m`, on the years when both instruments flew (2012–2020):

```
k_Aqua(m)  = Σ SNPP(y,m) / Σ Aqua(y,m)        k_Terra(m) = Σ SNPP(y,m) / Σ Terra(y,m)
H = w·k_Aqua·Aqua + (1−w)·k_Terra·Terra,      w = Aqua / (Aqua + Terra)      (2000–2011)
H = Suomi NPP                                                                (2012–Oct 2026)
```

Terra and Aqua are scaled separately because they fly at different times of day; only one VIIRS satellite (Suomi NPP) is used so that new satellites do not inflate counts. World cells use the same rule per 10° latitude band × month.

Tested on years the model never saw (2021–2025), Ukraine, monthly totals:

| | R² | bias |
|---|---|---|
| raw MODIS vs Suomi NPP | 0.16 | −71 % |
| harmonized MODIS vs Suomi NPP | **0.95** | +3.7 % |

Full derivation, uncertainty and limitations: [`docs/MATH.md`](docs/MATH.md) (Ukrainian) and [`model/README.md`](model/README.md).

## Run locally

Python 3 with pandas, Node.js 18+.

```bash
node pipeline/01_download.js && node pipeline/02_build_fires.js      # Ukraine hotspots (fires_v2)
python model/harmonize.py                                             # Ukraine harmonization
python model/harmonize_grid.py --input <grid_monthly_v1.csv.gz> --tag world   # world grid
python backend/export_static.py                                       # data files for the site
python -m http.server 8000 --directory frontend                       # open http://localhost:8000
```

## Use of AI

Parts of the code and documentation were written with the assistance of AI coding tools (Claude Code). The project idea, the harmonization approach and the conclusions are the team's own. Details: [`docs/SI_USAGE_LOG.md`](docs/SI_USAGE_LOG.md).

## References

TODO — every library, map tile provider, boundary dataset, font and image used.

## Team

Rostyslav Dorofieiev, Mykola Demianenko, Yehor Krupitsa, Mykhailo Revuzhenko, Vasylyna Kutsa, Ivan Knizhnytskyi.

TODO — confirm spelling of names in English.
