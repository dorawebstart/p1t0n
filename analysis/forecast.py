"""Fire outlook: where fires are likely in each month — a statistical forecast from 25 years of harmonized hotspots.

Written with AI assistance (Claude Code) from the team's design; run and checked by Team P1t0n.

Model (per 1° cell c and calendar month m):
    event        e(c,y,m) = 1 if harmonized hotspots H(c,y,m) >= T   (T = 10: an "active fire cell")
    year weight  w_y = 0.5 ** ((Y - 1 - y) / h)        (recent years count more; h = half-life in years)
    probability  p(c,m,Y) = (Σ_y<Y w_y·e(c,y,m) + a·p0(m)) / (Σ_y<Y w_y + a)
                 a beta prior of strength a pulls rare cells toward the global base rate p0(m)
    expected     E(c,m,Y) = Σ w_y·H(c,y,m) / Σ w_y
The half-life h and prior a are chosen by forecasting 2016–2020 (each year from the years before it);
the model is then tested on 2021–2025, never seen during the choice, against two baselines:
    climatology  all past years weighted equally (h = ∞)
    persistence  last year's same month (e = 1 → p = 1)
and on a true out-of-sample year: the 2026 outlook (from data to Dec 2025) vs the real Suomi NPP hotspots
in Ukraine, January–October 2026.
Scores: Brier score BS = mean (p − e)², skill BSS = 1 − BS/BS_ref, ROC AUC, reliability by probability bins.

Input:  frontend/public/data/world_cells/<YYYY-MM>.json   rows [lat, lon, harmonized, modis, viirs], 1° cells
        frontend/public/data/fires/UA/2026-MM.json        Ukraine points 2026 (Suomi NPP used)
        data/regions.geojson                               Ukrainian oblasts (cells fully inside Ukraine)
Output: frontend/public/data/outlook/2026-MM.json          rows [lat, lon, p (‰), expected hotspots]
        frontend/public/data/outlook/metrics.json          parameters, scores, reliability
"""
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend/public/data"
OUT = DATA / "outlook"
T = 10.0                 # hotspots per 1° cell per month that make an "active fire cell"
FIRST, LAST = 2001, 2025  # full years of the world grid
VAL_YEARS = range(2016, 2021)
TEST_YEARS = range(2021, 2026)


def load_grid():
    years = list(range(FIRST, LAST + 1))
    cells = {}
    rows = []
    for y in years:
        for m in range(1, 13):
            for r in json.load(open(DATA / f"world_cells/{y}-{m:02d}.json", encoding="utf-8")):
                key = (int(r[0]), int(r[1]))
                if key not in cells:
                    cells[key] = len(cells)
                rows.append((cells[key], y - FIRST, m - 1, float(r[2])))
    H = np.zeros((len(cells), len(years), 12), dtype=np.float32)
    for c, yi, mi, v in rows:
        H[c, yi, mi] = v
    keys = sorted(cells, key=cells.get)
    return H, keys, years


def forecast(H, Y_idx, h, a):
    """Probability and expected count for year index Y_idx from all earlier years. H: cells × years × 12."""
    past = H[:, :Y_idx, :]
    E = (past >= T).astype(np.float32)
    ages = (Y_idx - 1) - np.arange(Y_idx)
    w = np.ones(Y_idx) if h is None else 0.5 ** (ages / h)
    w = w.astype(np.float32)[None, :, None]
    sw = w.sum()
    p0 = (E * w).sum(axis=(0, 1)) / (sw * H.shape[0])          # base rate per month (all cells)
    p = ((E * w).sum(axis=1) + a * p0[None, :]) / (sw + a)
    ex = (past * w).sum(axis=1) / sw
    return p, ex


def brier(p, e):
    return float(np.mean((p - e) ** 2))


def auc(p, e):
    """ROC AUC by the rank-sum (Mann-Whitney) formula, ties get average ranks."""
    p = np.asarray(p, dtype=np.float64).ravel()
    e = np.asarray(e).ravel().astype(bool)
    npos, nneg = int(e.sum()), int((~e).sum())
    if npos == 0 or nneg == 0:
        return float("nan")
    _, inv, counts = np.unique(p, return_inverse=True, return_counts=True)
    upper = np.cumsum(counts)
    avg = upper - (counts - 1) / 2.0          # average rank of each distinct value
    ranks = avg[inv]
    return float((ranks[e].sum() - npos * (npos + 1) / 2) / (npos * nneg))


def reliability(p, e, edges=(0, .05, .1, .2, .3, .5, .7, .9, 1.0001)):
    p, e = np.asarray(p).ravel(), np.asarray(e).ravel()
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        k = (p >= lo) & (p < hi)
        if k.sum():
            out.append({"bin": [lo, round(min(hi, 1), 2)], "n": int(k.sum()),
                        "forecast": round(float(p[k].mean()), 3), "observed": round(float(e[k].mean()), 3)})
    return out


def scores(H, years_range, h, a, active_only=True, fast=False):
    """Pool forecasts of several years. Cells that never burned before are skipped in active_only mode
    (they would inflate every score with easy zeros)."""
    P, PC, PP, EV = [], [], [], []
    for Y in years_range:
        yi = Y - FIRST
        p, _ = forecast(H, yi, h, a)
        pc, _ = forecast(H, yi, None, a)
        pp = (H[:, yi - 1, :] >= T).astype(np.float32)
        e = (H[:, yi, :] >= T).astype(np.float32)
        mask = (H[:, :yi, :].max(axis=(1, 2)) > 0) if active_only else np.ones(H.shape[0], bool)
        P.append(p[mask]); PC.append(pc[mask]); PP.append(pp[mask]); EV.append(e[mask])
    P, PC, PP, EV = (np.concatenate(x) for x in (P, PC, PP, EV))
    bs, bsc, bsp = brier(P, EV), brier(PC, EV), brier(PP, EV)
    if fast:
        return {"brier": round(bs, 5)}
    return {"brier": round(bs, 4), "brier_climatology": round(bsc, 4), "brier_persistence": round(bsp, 4),
            "bss_vs_climatology": round(1 - bs / bsc, 3), "bss_vs_persistence": round(1 - bs / bsp, 3),
            "auc": round(auc(P, EV), 3), "auc_climatology": round(auc(PC, EV), 3),
            "event_rate": round(float(EV.mean()), 3), "n": int(EV.size),
            "reliability": reliability(P, EV)}


def ukraine_polygons():
    gj = json.load(open(ROOT / "data/regions.geojson", encoding="utf-8"))
    polys = []
    for f in gj["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for part in parts:
            polys.append(part[0])
    return polys


def inside(lon, lat, polys):
    for ring in polys:
        c = False
        n = len(ring)
        for i in range(n):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                c = not c
        if c:
            return True
    return False


def main():
    H, keys, years = load_grid()
    print(f"grid: {len(keys)} cells x {len(years)} years x 12 months")

    # 1. choose half-life and prior on 2016–2020
    best = None
    grid = []
    for h in (1, 2, 3, 5, 8, None):
        for a in (0.1, 0.25, 0.5, 1, 2):
            s = scores(H, VAL_YEARS, h, a, fast=True)
            grid.append({"half_life": h, "prior": a, "brier": s["brier"]})
            if best is None or s["brier"] < best[2]:
                best = (h, a, s["brier"])
    h, a = best[0], best[1]
    print("chosen half-life", h, "prior", a)

    # 2. test on unseen 2021–2025
    test = scores(H, TEST_YEARS, h, a)
    print("test 2021-2025:", {k: v for k, v in test.items() if k != "reliability"})

    # 3. outlook for 2026 from all years 2001–2025
    Yi = len(years)
    p26, ex26 = forecast(H, Yi, h, a)
    OUT.mkdir(parents=True, exist_ok=True)
    for m in range(12):
        rows = []
        for c, (la, lo) in enumerate(keys):
            if p26[c, m] >= 0.02 or ex26[c, m] >= 1:
                rows.append([la, lo, int(round(float(p26[c, m]) * 1000)), int(round(float(ex26[c, m])))])
        json.dump(rows, open(OUT / f"2026-{m + 1:02d}.json", "w", encoding="utf-8"), separators=(",", ":"))

    # 4. true out-of-sample check: Ukraine, Jan–Oct 2026, cells fully inside Ukraine, real Suomi NPP counts
    polys = ukraine_polygons()
    ua = [i for i, (la, lo) in enumerate(keys)
          if all(inside(lo + dx, la + dy, polys) for dx in (0.02, 0.98) for dy in (0.02, 0.98))]
    idx = {keys[i]: i for i in ua}
    obs = np.zeros((len(keys), 10), dtype=np.float32)
    for m in range(1, 11):
        for r in json.load(open(DATA / f"fires/UA/2026-{m:02d}.json", encoding="utf-8")):
            if r["satellite"] != "SNPP":
                continue
            k = (math.floor(r["lat"]), math.floor(r["lon"]))
            if k in idx:
                obs[idx[k], m - 1] += 1
    P = p26[ua, :10].ravel()
    PC, _ = forecast(H, Yi, None, a)
    PC = PC[ua, :10].ravel()
    EV = (obs[ua, :] >= T).astype(np.float32).ravel()
    ua26 = {"cells": len(ua), "months": "2026-01..2026-10", "n": int(EV.size),
            "event_rate": round(float(EV.mean()), 3),
            "brier": round(brier(P, EV), 4), "brier_climatology": round(brier(PC, EV), 4),
            "bss_vs_climatology": round(1 - brier(P, EV) / brier(PC, EV), 3),
            "auc": round(auc(P, EV), 3), "reliability": reliability(P, EV)}
    # expected vs observed Ukraine total (cells fully inside), per month
    ua26["monthly"] = [{"month": m + 1, "expected": int(round(float(ex26[ua, m].sum()))),
                        "observed": int(obs[ua, m].sum())} for m in range(10)]
    print("Ukraine 2026:", {k: v for k, v in ua26.items() if k not in ("reliability", "monthly")})

    metrics = {
        "threshold": T, "cell_deg": 1, "half_life_years": h, "prior_strength": a,
        "train": f"{FIRST}-{LAST} (each forecast uses only earlier years)",
        "choice_years": "2016-2020", "test_years": "2021-2025",
        "choice_grid": grid, "test": test, "ukraine_2026": ua26,
        "definition": "p = probability that a 1-degree cell has at least 10 harmonized (Suomi NPP scale) hotspots "
                      "in the month; recency-weighted climatology with a beta prior; expected = recency-weighted mean.",
        "notes": "Statistical seasonal outlook from 25 years of satellite hotspots — where and when fires usually "
                 "happen and how that is changing. It does not use weather forecasts, so it cannot see a dry spell "
                 "or a wet month coming; adding a fire-weather index is the next step.",
    }
    json.dump(metrics, open(OUT / "metrics.json", "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
