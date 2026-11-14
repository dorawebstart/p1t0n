"""Harmonization of MODIS (Terra + Aqua) to the Suomi NPP VIIRS scale, Ukraine.

Parts of this code were written with the assistance of AI (Claude). The method
choices below were checked by leave-one-year-out tests on 2012-2020 (see
`--diagnostics`); the project idea and the approach are the team's own.

Run from the repository root:

    python model/harmonize.py                 # build the two output tables
    python model/harmonize.py --diagnostics   # also reproduce the method-choice tests

Inputs  (data/):  grid_monthly_UKR_v1.csv.gz  (2000-2025, 0.25 degree cells)
                  fires_v2_*.csv.gz           (2000-2026, single hotspots)
Outputs (model/out/):
    ukraine_monthly.csv           year, month, terra, aqua, snpp, modis_count,
                                  viirs_count, harmonized_count      (for the team)
    ukraine_monthly_detail.csv    the same plus the scaled MODIS series and flags
    coefficients_ukraine.csv      k_aqua(month), k_terra(month) and how they were obtained
    method_selection_cv.csv       only with --diagnostics

Method
------
VIIRS on Suomi NPP (SNPP) sees several times more hotspots than MODIS, and the
ratio depends strongly on the month of the year (about 3.6 in October, 13 in June
for Ukraine). So for every month of the year we learn, on 2012-2020 when both
instruments worked,

    k_aqua(m)  = sum of SNPP / sum of Aqua    over the training years
    k_terra(m) = sum of SNPP / sum of Terra   over the training years

and translate MODIS into "SNPP-equivalent" counts. Aqua and Terra are scaled
separately and then averaged with weights proportional to their raw counts; before
Aqua started (July 2002) only Terra contributes. From the first full SNPP month
(February 2012) the harmonized series is the real SNPP count.

Why a ratio of sums (not a median of yearly ratios): it is the natural estimator
of a total and has no bias; the median of yearly ratios was biased by +2 % (Aqua)
and +6 % (Terra) in the tests.
Why (almost) no smoothing: pooling neighbouring months did not materially improve
out-of-sample accuracy (differences are within noise for Terra, and clearly worse
for Aqua beyond ~300 points), because the ratio changes quickly from month to month
(January 10, February 6, March 4 for Aqua). The winter error stays at about the same
level whatever the window, which points to the noise of single-digit monthly counts
rather than to the coefficient. We only widen the window symmetrically (+-1, +-2
months, ...) when a month has fewer than MIN_POINTS Aqua or Terra detections in the
training years (in practice only Terra in January).
Limitation: one winter MODIS detection is multiplied by 10-20, so harmonized winter
months before 2012 are noisy; the same months are just as irregular in the real SNPP years.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "model" / "out"

TRAIN_FIRST, TRAIN_LAST = 2012, 2020      # years used to learn the coefficients
SNPP_FIRST_FULL = (2012, 2)               # FIRMS Suomi NPP record starts on 20 Jan 2012
MIN_POINTS = 100                          # min. detections in the window (about 10 % Poisson error)
SATS = ["Terra", "Aqua", "SNPP"]


# ----------------------------------------------------------------------------
# Input: monthly detections per satellite
# ----------------------------------------------------------------------------
def monthly_from_grid(path):
    g = pd.read_csv(path, usecols=["year", "month", "satellite", "count"])
    return g.groupby(["year", "month", "satellite"])["count"].sum().unstack("satellite", fill_value=0)


def monthly_from_fires(paths):
    f = pd.concat([pd.read_csv(p, usecols=["date", "satellite"], dtype=str) for p in paths])
    f["year"] = f["date"].str[:4].astype(int)
    f["month"] = f["date"].str[5:7].astype(int)
    counts = f.groupby(["year", "month", "satellite"]).size().unstack("satellite", fill_value=0)
    return counts, f.groupby("satellite")["date"].max()


def load_monthly():
    """Monthly detections Terra / Aqua / SNPP, 2000-11 .. latest month.

    2000-2025 come from the grid; 2026 (not in the grid) from fires_v2. On the years
    both cover, they must agree exactly, otherwise the script stops.
    Months in which an instrument was not operating are NaN (not 0): zero means
    "it was observing and saw nothing".
    """
    grid_path = DATA / "grid_monthly_UKR_v1.csv.gz"
    fires_paths = sorted(DATA.glob("fires_v2_*.csv.gz"))
    if not grid_path.exists() or not fires_paths:
        sys.exit(f"Input files not found in {DATA}: need {grid_path.name} and fires_v2_*.csv.gz")

    grid = monthly_from_grid(grid_path)
    fires, last_date = monthly_from_fires(fires_paths)

    cols = [c for c in grid.columns if c in fires.columns]
    both = grid.index.union(fires.index[fires.index <= grid.index.max()])   # every month either source has
    diff = (grid.reindex(both)[cols].fillna(0) - fires.reindex(both)[cols].fillna(0)).abs().sum().sum()
    if diff != 0:
        sys.exit(f"grid_monthly and fires_v2 disagree on 2000-2025 by {int(diff)} detections")
    print(f"Check passed: grid_monthly == fires_v2 on {len(both)} months, {cols}")

    new = fires[fires.index > grid.index.max()]
    m = pd.concat([grid[SATS], new[SATS]]).sort_index()
    full = pd.MultiIndex.from_tuples(
        [(p.year, p.month) for p in pd.period_range(f"{m.index[0][0]}-{m.index[0][1]:02d}",
                                                    f"{m.index[-1][0]}-{m.index[-1][1]:02d}", freq="M")],
        names=["year", "month"])
    m = m.reindex(full, fill_value=0).astype(float)

    for sat in SATS:                       # not operating -> NaN
        nz = m.index[m[sat] > 0]
        if len(nz) == 0:
            sys.exit(f"No {sat} detections at all in the input data")
        pos = m.index.get_indexer(nz)
        m.iloc[: pos.min(), m.columns.get_loc(sat)] = np.nan
        m.iloc[pos.max() + 1:, m.columns.get_loc(sat)] = np.nan

    last_modis = pd.Timestamp(max(last_date["Terra"], last_date["Aqua"]))
    partial = (last_modis.year, last_modis.month) if last_modis.day < last_modis.days_in_month else None
    return m, partial


# ----------------------------------------------------------------------------
# Coefficients
# ----------------------------------------------------------------------------
def training_frame(m, exclude_year=None):
    """Training months. January 2012 is left out: SNPP covered only its last 11 days."""
    y = m.index.get_level_values("year")
    mo = m.index.get_level_values("month")
    keep = (y >= TRAIN_FIRST) & (y <= TRAIN_LAST) & ~((y == 2012) & (mo == 1))
    if exclude_year is not None:
        keep &= y != exclude_year
    return m[keep]


def fit_k(train, sat, min_points=MIN_POINTS):
    """k(month) = sum(SNPP) / sum(sat). The month window is widened symmetrically
    (+-1, +-2, ... months, around the year end) until it holds >= min_points `sat` points."""
    s = train.groupby(level="month")[[sat, "SNPP"]].sum().reindex(range(1, 13), fill_value=0)
    rows = []
    for month in range(1, 13):
        for half in range(0, 7):
            months = sorted({(month - 1 + d) % 12 + 1 for d in range(-half, half + 1)})
            den, num = s.loc[months, sat].sum(), s.loc[months, "SNPP"].sum()
            if den >= min_points:
                break
        if den == 0:
            sys.exit(f"No {sat} detections in the training years for month {month}")
        rows.append({"month": month, "k": num / den, "n_snpp": num, "n_sat": den, "half_window": half})
    return pd.DataFrame(rows).set_index("month")


def combine_modis(terra, aqua, k_terra, k_aqua, month):
    """Scale Terra and Aqua separately to the SNPP scale, then average them with weights
    proportional to their raw counts (Aqua = NaN before July 2002 -> Terra only)."""
    t, a = terra.fillna(0.0), aqua.fillna(0.0)
    terra_s = terra * month.map(k_terra)
    aqua_s = aqua * month.map(k_aqua)
    tot = t + a
    w_aqua = pd.Series(np.where(tot > 0, a / tot.where(tot > 0, 1), 0.5), index=terra.index)
    modis_s = w_aqua * aqua_s.fillna(0.0) + (1 - w_aqua) * terra_s.fillna(0.0)
    return terra_s, aqua_s, modis_s


# ----------------------------------------------------------------------------
# Build the tables
# ----------------------------------------------------------------------------
def build(m, partial):
    train = training_frame(m)
    ka, kt = fit_k(train, "Aqua"), fit_k(train, "Terra")

    year = m.index.get_level_values("year")
    month = pd.Series(m.index.get_level_values("month"), index=m.index)
    terra_s, aqua_s, modis_s = combine_modis(m["Terra"], m["Aqua"], kt["k"], ka["k"], month)

    snpp_ok = m["SNPP"].notna() & ((year > SNPP_FIRST_FULL[0]) | ((year == SNPP_FIRST_FULL[0]) & (month >= SNPP_FIRST_FULL[1])))
    harmonized = pd.Series(np.where(snpp_ok, m["SNPP"], modis_s), index=m.index)

    det = pd.DataFrame({
        "year": year, "month": month.values,
        "terra": m["Terra"], "aqua": m["Aqua"], "snpp": m["SNPP"],
        "modis_count": m["Terra"].fillna(0) + m["Aqua"].fillna(0),
        "viirs_count": m["SNPP"],
        "harmonized_count": harmonized.round(1),
        "terra_scaled": terra_s.round(1), "aqua_scaled": aqua_s.round(1), "modis_scaled": modis_s.round(1),
        "harmonized_source": np.where(snpp_ok, "snpp", "modis_scaled"),
    }).reset_index(drop=True)
    is_partial = pd.Series([(y, mo) == partial for y, mo in zip(det["year"], det["month"])])
    det["partial_month"] = is_partial
    last_year = int(det.year.max())
    det["note"] = ""
    det.loc[det.year == last_year, "note"] = f"{last_year} is preliminary (FIRMS standard + near-real-time data)"
    det.loc[(det.year == SNPP_FIRST_FULL[0]) & (det.month == 1), "note"] = (
        "SNPP record starts 20 Jan 2012: snpp is partial, harmonized_count = scaled MODIS")
    det.loc[is_partial, "note"] = (
        "partial month, SNPP switched off 2 Nov 2026: harmonized_count = scaled MODIS for the days so far")

    main = det[~det["partial_month"]][["year", "month", "terra", "aqua", "snpp", "modis_count", "viirs_count", "harmonized_count"]].copy()
    for c in ["terra", "aqua", "snpp", "viirs_count"]:
        main[c] = main[c].astype("Int64")
    main["modis_count"] = main["modis_count"].astype(int)

    coef = pd.DataFrame({
        "month": range(1, 13),
        "k_aqua": ka["k"].round(6).values, "k_terra": kt["k"].round(6).values,
        "aqua_points": ka["n_sat"].astype(int).values, "terra_points": kt["n_sat"].astype(int).values,
        "aqua_half_window": ka["half_window"].values, "terra_half_window": kt["half_window"].values,
    })
    return main, det, coef


def self_check(main, det):
    """Stop if the output breaks the rules the team relies on."""
    problems = []
    if main["harmonized_count"].isna().any():
        problems.append("harmonized_count has empty values")
    if (main["harmonized_count"] < 0).any():
        problems.append("harmonized_count has negative values")
    from_snpp = det["harmonized_source"] == "snpp"
    if not (det.loc[from_snpp, "harmonized_count"] == det.loc[from_snpp, "snpp"]).all():
        problems.append("harmonized_count differs from real SNPP in SNPP months")
    if (det.loc[det.year < SNPP_FIRST_FULL[0], "harmonized_source"] != "modis_scaled").any():
        problems.append("a month before 2012 is not taken from scaled MODIS")
    if main.duplicated(["year", "month"]).any():
        problems.append("duplicate months")
    if problems:
        sys.exit("Output check failed: " + "; ".join(problems))
    print("Output check passed: no gaps, no negatives, 2012+ = real SNPP, 2000-2011 = scaled MODIS")


# ----------------------------------------------------------------------------
# Diagnostics: why this method (leave-one-year-out on the training years only)
# ----------------------------------------------------------------------------
def diagnostics(m):
    tf = training_frame(m)
    years = range(TRAIN_FIRST, TRAIN_LAST + 1)

    def median_k(train, sat):
        r = (train["SNPP"] / train[sat].replace(0, np.nan)).groupby(level="month").median()
        return r.reindex(range(1, 13)).interpolate().bfill().ffill()

    def scaled(test, sat, k):
        return test[sat] * pd.Series(test.index.get_level_values("month"), index=test.index).map(k)

    def pred_rule(rule, n_min):
        def f(train, test):
            ka, kt = fit_k(train, "Aqua", n_min)["k"], fit_k(train, "Terra", n_min)["k"]
            a, t = scaled(test, "Aqua", ka), scaled(test, "Terra", kt)
            if rule == "aqua":
                return a
            if rule == "terra":
                return t
            if rule == "mean":
                return 0.5 * (a + t)
            if rule == "joint":
                both = train.assign(Both=train["Terra"] + train["Aqua"])
                kb = fit_k(both, "Both", n_min)["k"]
                return scaled(test.assign(Both=test["Terra"] + test["Aqua"]), "Both", kb)
            month = pd.Series(test.index.get_level_values("month"), index=test.index)
            return combine_modis(test["Terra"], test["Aqua"], kt, ka, month)[2]
        return f

    def median_rule(sat):
        return lambda train, test: scaled(test, sat, median_k(train, sat))

    def evaluate(group, label, fn):
        errs, annual = [], []
        for y in years:
            train, test = training_frame(m, exclude_year=y), tf[tf.index.get_level_values("year") == y]
            p = fn(train, test)
            e = pd.DataFrame({"pred": p, "act": test["SNPP"]})
            e = e[~((e.index.get_level_values("year") == 2012) & (e.index.get_level_values("month") == 1))]
            errs.append(e)
            annual.append(100 * (e.pred.sum() - e.act.sum()) / e.act.sum())
        e = pd.concat(errs)
        winter = e[e.index.get_level_values("month").isin([12, 1, 2])]
        return {
            "group": group, "method": label,
            "wape_pct": round(100 * (e.pred - e.act).abs().sum() / e.act.sum(), 1),
            "bias_pct": round(100 * (e.pred - e.act).sum() / e.act.sum(), 1),
            "mae_log": round((np.log1p(e.pred) - np.log1p(e.act)).abs().mean(), 3),
            "mae_log_winter": round((np.log1p(winter.pred) - np.log1p(winter.act)).abs().mean(), 3),
            "mean_abs_annual_error_pct": round(float(np.mean(np.abs(annual))), 1),
        }

    rows = []
    for sat, rule in [("Aqua", "aqua"), ("Terra", "terra")]:
        for n in [0, 100, 300, 500, 1000, 2000]:
            rows.append(evaluate("smoothing", f"{sat}: ratio of sums, window until >= {n} points", pred_rule(rule, n)))
        rows.append(evaluate("smoothing", f"{sat}: median of yearly ratios", median_rule(sat)))
    for label, rule in [("(i) Aqua only", "aqua"), ("(ii) mean of scaled Terra and Aqua", "mean"),
                        ("(iii) one joint ratio SNPP / (Terra + Aqua)", "joint"),
                        ("(iv) scaled separately, weighted by counts [USED]", "weighted")]:
        rows.append(evaluate("combination", label, pred_rule(rule, MIN_POINTS)))
    res = pd.DataFrame(rows)
    print("\nLeave-one-year-out on %d-%d (SNPP predicted from MODIS, monthly Ukraine totals)" % (TRAIN_FIRST, TRAIN_LAST))
    print(res.to_string(index=False))
    res.to_csv(OUT / "method_selection_cv.csv", index=False)
    print(f"\nSaved {OUT / 'method_selection_cv.csv'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--diagnostics", action="store_true", help="also reproduce the method-choice tests")
    args = ap.parse_args()

    m, partial = load_monthly()
    main_df, detail, coef = build(m, partial)
    self_check(main_df, detail)
    OUT.mkdir(parents=True, exist_ok=True)
    main_df.to_csv(OUT / "ukraine_monthly.csv", index=False)
    detail.to_csv(OUT / "ukraine_monthly_detail.csv", index=False)
    coef.to_csv(OUT / "coefficients_ukraine.csv", index=False)

    last = main_df.iloc[-1]
    print(f"Saved {len(main_df)} complete months {int(main_df.year.iloc[0])}-{int(main_df.month.iloc[0]):02d} .. "
          f"{int(last.year)}-{int(last.month):02d} to {OUT / 'ukraine_monthly.csv'}")
    if partial:
        print(f"Partial month {partial[0]}-{partial[1]:02d} is only in ukraine_monthly_detail.csv")
    print("\nCoefficients (SNPP per MODIS detection):")
    print(coef.to_string(index=False))
    if args.diagnostics:
        diagnostics(m)


if __name__ == "__main__":
    main()
