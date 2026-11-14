# P1t0n — Fire Calendar of Ukraine

**NASA Space Apps Challenge 2026 · Local Event: Dnipro · Challenge: [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)**

> Work in progress during the hackathon (14–15 November 2026).

- **Live site:** TODO
- **Mirror:** TODO
- **Demo video (≤ 30 s):** TODO
- **Team page:** https://www.spaceappschallenge.org/2026/find-a-team/p1t0n/

## The problem

NASA satellites have recorded active fires since 2000, but the record is split between two instruments:

- **MODIS** (Terra, Aqua), since 2000, ~1 km pixels;
- **VIIRS** (Suomi NPP, NOAA-20/21), since 2012, ~375 m pixels — it detects several times more hotspots for the same fires.

Adding the two archives together produces a false jump in fire activity after 2012.

## What we build

A web application that harmonizes MODIS and VIIRS hotspots from NASA FIRMS into one consistent **burning activity calendar** for Ukraine, 2000–2026:

- month × year heat map for a selected region, with anomalies against the historical median;
- map with MODIS / VIIRS / harmonized layers;
- region and date range selection;
- CSV download of the hotspots found;
- published accuracy of the harmonization (MAE, R²) and its limitations.

## Data

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — MODIS Collection 6.1 and VIIRS 375 m active fire products.
- Other sources and libraries are listed in [References](#references).

## Repository layout

| Folder | Contents |
|---|---|
| `pipeline/` | Download and cleaning of FIRMS hotspots → `fires` table |
| `model/` | Harmonization, monthly calendar, accuracy metrics |
| `backend/` | API / static data export for the site |
| `frontend/` | Web application |
| `data/` | Small derived data files and their description |
| `docs/` | Team documents and submission materials |

## Run locally

TODO — filled in once the components exist.

## Use of AI

Parts of the code and documentation were written with the assistance of AI coding tools (Claude Code). The project idea, the harmonization approach and the conclusions are the team's own. Details: [`docs/SI_USAGE_LOG.md`](docs/SI_USAGE_LOG.md).

## References

TODO — every library, map tile provider, boundary dataset, font and image used.

## Team

Rostyslav Dorofieiev, Mykola Demianenko, Yehor Krupitsa, Mykhailo Revuzhenko, Vasylyna Kutsa, Ivan Knizhnytskyi.

TODO — confirm spelling of names in English.
