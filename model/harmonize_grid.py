"""Harmonization of MODIS (Terra + Aqua) to the Suomi NPP VIIRS scale on the 0.25 degree grid.

Parts of this code were written with the assistance of AI (Claude). The method is the
team's own and is the same as in `model/harmonize.py` (Ukraine), extended to the whole
planet with one set of coefficients per latitude band.

Run from the repository root:

    python model/harmonize_grid.py                                   # Ukraine grid (test)
    python model/harmonize_grid.py --input path/to/grid_monthly_v1.csv.gz --tag world
    python model/harmonize_grid.py --band 180                        # one band = harmonize.py

Input:  grid_monthly (data contract v2): cell_id, lat, lon, year, month, sensor,
        satellite, count, frp_sum. Read in chunks, so the world file does not have to fit
        in memory as raw rows.
Output (model/out/):
    grid_harmonized_<tag>.csv.gz    cell_id, year, month, modis_count, viirs_count,
                                    harmonized_count                  (data contract v2)
    coefficients_<tag>.csv          k_aqua, k_terra per latitude band x month
    validation_<tag>.csv            monthly totals 2021-2025: real SNPP vs MODIS scaled
    metrics_<tag>.json              MAE, R2, bias on the held-out years 2021-2025

Method
------
For every latitude band (10 degrees by default) and month of the year, on the training
years 2012-2020 (January 2012 left out: SNPP covered only its last 11 days):

    k_aqua(band, m)  = sum of SNPP / sum of Aqua   over all cells of the band
    k_terra(band, m) = sum of SNPP / sum of Terra

Why bands: MODIS has gaps between orbits near the equator while VIIRS sees the whole
Earth every day, and the number of overpasses grows with latitude, so the ratio depends
on latitude. Why month: the ratio changes with the season (fire size, cloud, crops).
If a band-month has fewer than MIN_POINTS Aqua (or Terra) detections, the month window is
widened symmetrically (+-1, +-2 ... months); if the whole year of the band is still too
thin, neighbouring bands are pooled (+-1 band, +-2 ...), and as a last resort the whole
planet. Every coefficient records how it was obtained.

A cell-month is translated as

    scaled = w * k_aqua * Aqua_cell + (1 - w) * k_terra * Terra_cell,
    w = Aqua_band / (Aqua_band + Terra_band)        (raw counts of the band in that month)

i.e. Terra and Aqua are scaled separately and weighted by their raw counts, as in
harmonize.py. The weight is taken from the band, not from the cell, so `scaled` is a
linear function of the cell counts: the sum over any set of cells (a country, a
rectangle drawn on the map) equals the harmonized value of that set. The site relies on
this when it adds cells up. Before July 2002 there is no Aqua, w = 0 (Terra only).

harmonized_count = real SNPP from February 2012 in every month in which SNPP was operating
(any SNPP detection in the input), otherwise scaled MODIS. With `--band 180` there is one
band and the sum over the Ukraine grid reproduces `harmonize.py` exactly.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "model" / "out"

TRAIN_FIRST, TRAIN_LAST = 2012, 2020      # years used to learn the coefficients
TEST_FIRST, TEST_LAST = 2021, 2025        # held-out years for the accuracy check
SNPP_FIRST_FULL = (2012, 2)               # FIRMS Suomi NPP record starts on 20 Jan 2012
MIN_POINTS = 100                          # min. detections behind a coefficient (~10 % Poisson error)
CHUNK = 2_000_000                         # input rows per chunk
USECOLS = ["cell_id", "lat", "year", "month", "satellite", "count"]
DTYPES = {"cell_id": "string", "lat": "float64", "year": "int16", "month": "int8",
          "satellite": "category", "count": "int64"}


def band_of(lat, band):
    """South edge of the latitude band of a cell (lat = cell centre)."""
    return (np.floor(lat / band) * band).astype(int)


def read_chunks(path):
    return pd.read_csv(path, usecols=USECOLS, dtype=DTYPES, chunksize=CHUNK)


# ----------------------------------------------------------------------------
# Pass 1: totals per band x year x month x satellite
# ----------------------------------------------------------------------------
def band_totals(path, band):
    parts = []
    n_rows = 0
    for ch in read_chunks(path):
        n_rows += len(ch)
        ch["band"] = band_of(ch["lat"].to_numpy(), band)
        parts.append(ch.groupby(["band", "year", "month", "satellite"], observed=True)["count"].sum())
    t = pd.concat(parts).groupby(level=[0, 1, 2, 3]).sum().unstack("satellite", fill_value=0)
    for sat in ["Terra", "Aqua", "SNPP"]:
        if sat not in t.columns:
            t[sat] = 0
    print(f"Pass 1: {n_rows:,} input rows, bands {sorted(t.index.get_level_values('band').unique())}")
    return t[["Terra", "Aqua", "SNPP"]].astype(float)


def snpp_months(totals):
    """Year-months in which SNPP counts are used (operating and from February 2012)."""
    s = totals["SNPP"].groupby(level=["year", "month"]).sum()
    ym = s.index[s > 0]
    return {(y, m) for y, m in ym if (y, m) >= SNPP_FIRST_FULL}


def training(totals):
    y = totals.index.get_level_values("year")
    mo = totals.index.get_level_values("month")
    keep = (y >= TRAIN_FIRST) & (y <= TRAIN_LAST) & ~((y == 2012) & (mo == 1))
    return totals[keep].groupby(level=["band", "month"]).sum()


# ----------------------------------------------------------------------------
# Coefficients
# ----------------------------------------------------------------------------
def fit_k(train, sat, bands, band, min_points=MIN_POINTS):
    """k(band, month) = sum(SNPP) / sum(sat) with month window and band pooling fallback."""
    s = train[[sat, "SNPP"]]
    all_bands = sorted(bands)
    rows = []
    for b in all_bands:
        for month in range(1, 13):
            found = None
            for pool in range(0, len(all_bands) + 1):
                if pool == len(all_bands):
                    pool_bands, pool_label = all_bands, "planet"
                else:
                    pool_bands = [x for x in all_bands if abs(x - b) <= pool * band]
                    pool_label = "band" if pool == 0 else f"band+-{pool}"
                sub = s[s.index.get_level_values("band").isin(pool_bands)].groupby(level="month").sum()
                sub = sub.reindex(range(1, 13), fill_value=0)
                for half in range(0, 7):
                    months = sorted({(month - 1 + d) % 12 + 1 for d in range(-half, half + 1)})
                    den, num = sub.loc[months, sat].sum(), sub.loc[months, "SNPP"].sum()
                    if den >= min_points:
                        found = (num / den, num, den, half, pool_label)
                        break
                if found:
                    break
            if not found:
                if den == 0:
                    sys.exit(f"No {sat} detections in the training years at all")
                found = (num / den, num, den, 6, "planet (below MIN_POINTS)")
            k, num, den, half, pool_label = found
            rows.append({"band_south": b, "month": month, "k": k, "n_snpp": int(num), "n_sat": int(den),
                         "half_window": half, "pooled_from": pool_label})
    return pd.DataFrame(rows).set_index(["band_south", "month"])


def aqua_weight(totals):
    """w = Aqua / (Aqua + Terra) per band x year x month (0 when the band saw nothing)."""
    tot = totals["Aqua"] + totals["Terra"]
    return (totals["Aqua"] / tot.where(tot > 0)).fillna(0.0).rename("w_aqua")


# ----------------------------------------------------------------------------
# Pass 2: harmonized cells
# ----------------------------------------------------------------------------
def harmonize_cells(path, band, ka, kt, w, use_snpp):
    """Every input row is turned into its contribution to modis / viirs / scaled MODIS of
    its cell-month (all three are sums, so partial results from chunks can be added up)."""
    snpp_idx = pd.MultiIndex.from_tuples(sorted(use_snpp), names=["year", "month"])
    parts = []
    for ch in read_chunks(path):
        ch = ch[ch["satellite"].isin(["Terra", "Aqua", "SNPP"])].copy()
        ch["band"] = band_of(ch["lat"].to_numpy(), band)
        key_bm = pd.MultiIndex.from_arrays([ch["band"], ch["month"]])
        key_bym = pd.MultiIndex.from_arrays([ch["band"], ch["year"], ch["month"]])
        wa = w.reindex(key_bym).to_numpy()
        is_t, is_a, is_s = (ch["satellite"] == s for s in ("Terra", "Aqua", "SNPP"))
        c = ch["count"].to_numpy(dtype=float)
        factor = np.where(is_a, wa * ka.reindex(key_bm).to_numpy(),
                          np.where(is_t, (1 - wa) * kt.reindex(key_bm).to_numpy(), 0.0))
        part = pd.DataFrame({
            "cell_id": ch["cell_id"], "year": ch["year"], "month": ch["month"],
            "modis_count": np.where(is_t | is_a, c, 0.0),
            "viirs_count": np.where(is_s, c, 0.0),
            "scaled": c * factor,
        })
        parts.append(part.groupby(["cell_id", "year", "month"], observed=True).sum())
    g = pd.concat(parts).groupby(level=[0, 1, 2]).sum().reset_index()
    in_snpp = pd.MultiIndex.from_arrays([g["year"], g["month"]]).isin(snpp_idx)
    g["snpp_period"] = in_snpp
    g["harmonized_count"] = np.where(in_snpp, g["viirs_count"], g["scaled"])
    return g


def self_check(g, use_snpp):
    problems = []
    if g["harmonized_count"].isna().any():
        problems.append("harmonized_count has empty values (a band-month without a coefficient?)")
    if (g["harmonized_count"] < 0).any():
        problems.append("harmonized_count has negative values")
    if g.duplicated(["cell_id", "year", "month"]).any():
        problems.append("duplicate cell-months")
    if not (g.loc[g.snpp_period, "harmonized_count"] == g.loc[g.snpp_period, "viirs_count"]).all():
        problems.append("harmonized_count differs from real SNPP in SNPP months")
    if (g.loc[g.year < SNPP_FIRST_FULL[0], "snpp_period"]).any():
        problems.append("a month before 2012 is taken from SNPP")
    if problems:
        sys.exit("Output check failed: " + "; ".join(problems))
    print("Output check passed: no gaps, no negatives, no duplicates, SNPP months = real SNPP")


# ----------------------------------------------------------------------------
# Accuracy on the held-out years
# ----------------------------------------------------------------------------
def scores(pred, act):
    pred, act = np.asarray(pred, float), np.asarray(act, float)
    ss_res = ((act - pred) ** 2).sum()
    ss_tot = ((act - act.mean()) ** 2).sum()
    return {
        "mae": round(float(np.abs(pred - act).mean()), 2),
        "r2": round(float(1 - ss_res / ss_tot), 4) if ss_tot > 0 else None,
        "bias_pct": round(float(100 * (pred.sum() - act.sum()) / act.sum()), 1) if act.sum() > 0 else None,
        "wape_pct": round(float(100 * np.abs(pred - act).sum() / act.sum()), 1) if act.sum() > 0 else None,
        "n": int(len(act)),
    }


def validate(g, band, use_snpp):
    """MODIS scaled with the 2012-2020 coefficients vs real SNPP on 2021-2025."""
    test = g[(g.year >= TEST_FIRST) & (g.year <= TEST_LAST) & g.snpp_period]
    if test.empty:
        print("No held-out SNPP months in the input, accuracy not computed")
        return None, None
    monthly = test.groupby(["year", "month"])[["viirs_count", "scaled", "modis_count"]].sum().reset_index()
    lat = test["cell_id"].str.split("_").str[0].astype(float) + 0.125
    test = test.assign(band_south=band_of(lat.to_numpy(), band))
    per_band = {}
    for b, sub in test.groupby("band_south"):
        m = sub.groupby(["year", "month"])[["viirs_count", "scaled"]].sum()
        per_band[f"{b}..{b + band}"] = scores(m["scaled"], m["viirs_count"])
    metrics = {
        "train_years": f"{TRAIN_FIRST}-{TRAIN_LAST}",
        "test_years": f"{TEST_FIRST}-{TEST_LAST}",
        "monthly_totals": scores(monthly["scaled"], monthly["viirs_count"]),
        "cell_months": scores(test["scaled"], test["viirs_count"]),
        "raw_modis_vs_snpp_monthly_totals": scores(monthly["modis_count"], monthly["viirs_count"]),
        "per_band_monthly_totals": per_band,
    }
    monthly = monthly.rename(columns={"viirs_count": "snpp", "scaled": "modis_scaled", "modis_count": "modis_raw"})
    monthly["modis_scaled"] = monthly["modis_scaled"].round(1)
    return metrics, monthly


# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--input", default=str(DATA / "grid_monthly_UKR_v1.csv.gz"), help="grid_monthly CSV(.gz)")
    ap.add_argument("--tag", default=None, help="suffix of the output files (default: from the input name)")
    ap.add_argument("--band", type=float, default=10, help="latitude band height in degrees (default 10)")
    args = ap.parse_args()

    path = Path(args.input)
    if not path.exists():
        sys.exit(f"Input not found: {path}")
    tag = args.tag or ("UKR" if "UKR" in path.name else path.name.split(".")[0])
    band = args.band

    totals = band_totals(path, band)
    use_snpp = snpp_months(totals)
    train = training(totals)
    bands = sorted(totals.index.get_level_values("band").unique())
    ka, kt = fit_k(train, "Aqua", bands, band), fit_k(train, "Terra", bands, band)
    w = aqua_weight(totals)

    g = harmonize_cells(path, band, ka["k"].rename_axis(["band", "month"]),
                        kt["k"].rename_axis(["band", "month"]), w, use_snpp)
    self_check(g, use_snpp)

    OUT.mkdir(parents=True, exist_ok=True)
    out = g[["cell_id", "year", "month", "modis_count", "viirs_count", "harmonized_count"]].copy()
    out["modis_count"] = out["modis_count"].astype(int)
    out["viirs_count"] = out["viirs_count"].astype(int).astype("Int64").where(g["snpp_period"] | (g["viirs_count"] > 0))
    # 3 decimals: with 2, rounding of many single-detection cells adds up to ~1 point a month
    out["harmonized_count"] = out["harmonized_count"].round(3)
    out = out.sort_values(["cell_id", "year", "month"])
    out.to_csv(OUT / f"grid_harmonized_{tag}.csv.gz", index=False)

    coef = ka.rename(columns=lambda c: f"{c}_aqua" if c != "k" else "k_aqua").join(
        kt.rename(columns=lambda c: f"{c}_terra" if c != "k" else "k_terra"))
    coef["band_north"] = coef.index.get_level_values("band_south") + band
    coef = coef.reset_index()[["band_south", "band_north", "month", "k_aqua", "k_terra",
                               "n_sat_aqua", "n_sat_terra", "half_window_aqua", "half_window_terra",
                               "pooled_from_aqua", "pooled_from_terra"]]
    coef[["k_aqua", "k_terra"]] = coef[["k_aqua", "k_terra"]].round(6)
    coef.to_csv(OUT / f"coefficients_{tag}.csv", index=False)

    metrics, monthly = validate(g, band, use_snpp)
    if metrics:
        metrics.update({"input": path.name, "band_degrees": band,
                        "viirs_reference": "Suomi NPP (VNP14IMG); coefficients SNPP/Aqua and SNPP/Terra "
                                           "per latitude band x month, trained 2012-2020"})
        (OUT / f"metrics_{tag}.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        monthly.to_csv(OUT / f"validation_{tag}.csv", index=False)

    print(f"Saved {len(out):,} cell-months ({out.cell_id.nunique():,} cells, "
          f"{int(out.year.min())}-{int(out.year.max())}) to {OUT / f'grid_harmonized_{tag}.csv.gz'}")
    print("\nCoefficients (SNPP per MODIS detection):")
    print(coef[["band_south", "band_north", "month", "k_aqua", "k_terra", "pooled_from_aqua",
                "pooled_from_terra", "half_window_aqua", "half_window_terra"]].to_string(index=False))
    if metrics:
        print(f"\nHeld-out {TEST_FIRST}-{TEST_LAST}, monthly totals, MODIS scaled vs real SNPP:",
              metrics["monthly_totals"])
        print("Same, raw MODIS (no harmonization):", metrics["raw_modis_vs_snpp_monthly_totals"])
        print("Cell-months:", metrics["cell_months"])


if __name__ == "__main__":
    main()
