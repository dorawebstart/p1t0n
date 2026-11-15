"""Export real pipeline output to the static site files (contract v2) in frontend/public/data/.

Parts of this code were written with the assistance of AI (Claude Code); reviewed by the P1t0n captain.

Inputs (repository paths):
  model/out/ukraine_monthly.csv       Yehor: harmonized Ukraine series (year, month, ..., harmonized_count)
  model/out/coefficients_ukraine.csv  Yehor: k_aqua(month), k_terra(month)
  data/fires_v2_*.csv.gz              Mykola: single hotspots of Ukraine with oblast (`region`)
  data/regions.geojson                oblast boundaries (for bbox)
  analysis/out/calendar.csv           analysis/build_calendar.py (optional): if present, used instead of computing oblast calendars here
  analysis/out/metrics.json           analysis (optional): validation metrics
  docs/figures/raw_series_ukraine.png figure for the "Problem" section

Oblast calendars use exactly Yehor's rule (model/harmonize.py, combine_modis):
  H = w * k_aqua(m) * Aqua + (1 - w) * k_terra(m) * Terra,  w = Aqua / (Aqua + Terra)   for months before Feb 2012
  H = Suomi NPP count                                                                    from Feb 2012

World (optional, the files are too large for git — Google Drive / USB):
  --world-grid    grid_harmonized_world.csv.gz  (model/harmonize_grid.py --tag world)
  --cell-country  cell_country.csv              (pipeline/06_cell_country.js)
  -> calendars WORLD and one per country (ISO-3); model/out/metrics_world.json -> metrics.world

Run from the repository root:
  python backend/export_static.py
  python backend/export_static.py --world-grid <path> --cell-country <path>
"""
import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "data"
FIG_OUT = ROOT / "frontend" / "public" / "figures"
SNPP_FIRST_FULL = (2012, 2)
FIRE_MONTHS_FROM = "2026-01"          # point files for the map: current year only (size; map is secondary)
POINT_SATS = ["Terra", "Aqua", "SNPP"]  # one VIIRS satellite, as in the harmonized series


def region_id(name: str) -> str:
    """Contract rule (CLAUDE.md): 'Kyiv Oblast' -> UKR-Kyiv, 'Kyiv City' -> UKR-Kyiv-City."""
    return "UKR-" + name.removesuffix(" Oblast").removeprefix("Autonomous Republic of ").replace(" ", "-")


def need(path: Path) -> Path:
    if not path.exists():
        sys.exit(f"Missing input: {path.relative_to(ROOT)}")
    return path


def check_cols(df: pd.DataFrame, cols, name):
    missing = set(cols) - set(df.columns)
    if missing:
        sys.exit(f"{name}: missing columns {sorted(missing)}; has {list(df.columns)}")


def add_stats(cal: pd.DataFrame) -> pd.DataFrame:
    """median_count, p25_count, p75_count and anomaly (z-score) per region and calendar month."""
    g = cal.groupby(["region_id", "month"])["harmonized_count"]
    cal["median_count"] = g.transform("median")
    cal["p25_count"] = g.transform(lambda s: s.quantile(0.25))
    cal["p75_count"] = g.transform(lambda s: s.quantile(0.75))
    # sample SD (ddof=1), the same as analysis/build_calendar.py uses for Ukraine and its oblasts
    sd = g.transform(lambda s: s.std(ddof=1)).replace(0, np.nan)
    cal["anomaly"] = ((cal["harmonized_count"] - cal["median_count"]) / sd).round(2).fillna(0.0)
    for c in ["harmonized_count", "median_count", "p25_count", "p75_count"]:
        cal[c] = cal[c].round(1)
    return cal


def ukraine_calendar() -> pd.DataFrame:
    u = pd.read_csv(need(ROOT / "model/out/ukraine_monthly.csv"))
    check_cols(u, ["year", "month", "modis_count", "viirs_count", "harmonized_count"], "ukraine_monthly.csv")
    u = u[["year", "month", "modis_count", "viirs_count", "harmonized_count"]].copy()
    u.insert(0, "region_id", "UKR")
    return u


def oblast_calendars(fires: pd.DataFrame, last_ym) -> pd.DataFrame:
    coef = pd.read_csv(need(ROOT / "model/out/coefficients_ukraine.csv"))
    check_cols(coef, ["month", "k_aqua", "k_terra"], "coefficients_ukraine.csv")
    ka, kt = coef.set_index("month")["k_aqua"], coef.set_index("month")["k_terra"]

    f = fires[fires["satellite"].isin(POINT_SATS)]
    c = f.groupby(["region", "year", "month", "satellite"]).size().unstack("satellite", fill_value=0)
    c = c.reindex(columns=POINT_SATS, fill_value=0).reset_index()

    # every region × every month in the record, zeros where nothing was detected
    months = pd.period_range("2000-11", f"{last_ym[0]}-{last_ym[1]:02d}", freq="M")
    full = pd.MultiIndex.from_product([sorted(c["region"].unique()), [(p.year, p.month) for p in months]])
    idx = pd.DataFrame([(r, y, m) for r, (y, m) in full], columns=["region", "year", "month"])
    c = idx.merge(c, on=["region", "year", "month"], how="left").fillna(0)

    t, a, s = c["Terra"], c["Aqua"], c["SNPP"]
    tot = t + a
    w = np.where(tot > 0, a / tot.where(tot > 0, 1), 0.5)
    scaled = w * a * c["month"].map(ka) + (1 - w) * t * c["month"].map(kt)
    snpp_ok = (c["year"] > SNPP_FIRST_FULL[0]) | ((c["year"] == SNPP_FIRST_FULL[0]) & (c["month"] >= SNPP_FIRST_FULL[1]))
    c["harmonized_count"] = np.where(snpp_ok, s, scaled)
    c["modis_count"] = tot.astype(int)
    c["viirs_count"] = np.where(c["year"] >= 2012, s, np.nan)
    c["region_id"] = c["region"].map(region_id)
    return c[["region_id", "year", "month", "modis_count", "viirs_count", "harmonized_count"]]


def world_calendars(grid_path: Path, cc_path: Path):
    """WORLD + one calendar per country: sums of harmonized 0.25° cells (linear, so area total = sum of cells)."""
    import pycountry  # build-time only: ISO-3 -> country name

    cc = pd.read_csv(cc_path, dtype=str, keep_default_na=False)
    check_cols(cc, ["cell_id", "iso3"], "cell_country.csv")
    iso = cc.set_index("cell_id")["iso3"]
    parts = []
    for chunk in pd.read_csv(grid_path, chunksize=2_000_000):
        check_cols(chunk, ["cell_id", "year", "month", "modis_count", "viirs_count", "harmonized_count"], "grid_harmonized")
        chunk["iso3"] = chunk["cell_id"].map(iso).fillna("")
        parts.append(chunk.groupby(["iso3", "year", "month"])[["modis_count", "viirs_count", "harmonized_count"]]
                     .sum(min_count=1).reset_index())
        lat_lon = chunk["cell_id"].str.split("_", expand=True).astype(float)
        chunk["lat"], chunk["lon"] = lat_lon[0], lat_lon[1]
        parts.append(chunk.groupby("iso3").agg(lat0=("lat", "min"), lat1=("lat", "max"),
                                               lon0=("lon", "min"), lon1=("lon", "max")).reset_index())
    sums = pd.concat([p for p in parts if "year" in p.columns])
    boxes = pd.concat([p for p in parts if "lat0" in p.columns]).groupby("iso3").agg(
        lat0=("lat0", "min"), lat1=("lat1", "max"), lon0=("lon0", "min"), lon1=("lon1", "max"))
    sums = sums.groupby(["iso3", "year", "month"], as_index=False).sum(min_count=1)

    world = sums.groupby(["year", "month"], as_index=False)[["modis_count", "viirs_count", "harmonized_count"]].sum(min_count=1)
    world.insert(0, "region_id", "WORLD")
    countries = sums[(sums["iso3"] != "") & (sums["iso3"] != "UKR")].rename(columns={"iso3": "region_id"})

    # FIRMS codes that are not ISO-3 countries
    EXTRA = {"ESB": "Dhekelia (UK Sovereign Base Area)", "WSB": "Akrotiri (UK Sovereign Base Area)",
             "USG": "Guantanamo Bay (US Naval Base)"}

    def name(code):
        if code in EXTRA:
            return EXTRA[code]
        c = pycountry.countries.get(alpha_3=code)
        return getattr(c, "common_name", None) or (c.name if c else code)

    meta = [{"id": "WORLD", "name": "World", "bbox": [-180, -90, 180, 90]}]
    for code in sorted(countries["region_id"].unique(), key=name):
        b = boxes.loc[code]
        meta.append({"id": code, "name": name(code),
                     "bbox": [float(b.lon0), float(b.lat0), float(b.lon1) + 0.25, float(b.lat1) + 0.25]})
    cal = pd.concat([world, countries], ignore_index=True)
    # full month index per zone (zeros where nothing was detected), 2000-11 .. last grid month
    months = pd.period_range("2000-11", f"{int(cal.year.max())}-12", freq="M")
    full = pd.MultiIndex.from_product([cal["region_id"].unique(), [(p.year, p.month) for p in months]])
    idx = pd.DataFrame([(r, y, m) for r, (y, m) in full], columns=["region_id", "year", "month"])
    cal = idx.merge(cal, on=["region_id", "year", "month"], how="left")
    cal[["modis_count", "harmonized_count"]] = cal[["modis_count", "harmonized_count"]].fillna(0)
    cal.loc[cal["year"] >= 2012, "viirs_count"] = cal.loc[cal["year"] >= 2012, "viirs_count"].fillna(0)
    cal["modis_count"] = cal["modis_count"].round().astype(int)
    return cal, meta


def world_cells(grid_path: Path) -> dict:
    """Hotspots per 1° cell and month for the world map:
    {'YYYY-MM': [[lat, lon, harmonized, modis, viirs], ...]} (modis = Terra+Aqua raw, viirs = Suomi NPP raw).
    lat/lon = south-west corner of the 1° cell. Sum of harmonized over a month = WORLD calendar of that month."""
    cols = ["harmonized_count", "modis_count", "viirs_count"]
    parts = []
    for chunk in pd.read_csv(grid_path, usecols=["cell_id", "year", "month"] + cols, chunksize=2_000_000):
        ll = chunk["cell_id"].str.split("_", expand=True).astype(float)
        chunk["la"] = np.floor(ll[0]).astype(int)
        chunk["lo"] = np.floor(ll[1]).astype(int)
        parts.append(chunk.groupby(["year", "month", "la", "lo"])[cols].sum().reset_index())
    g = pd.concat(parts).groupby(["year", "month", "la", "lo"], as_index=False)[cols].sum()
    g = g[(g[cols] > 0).any(axis=1)]
    out = {}
    for (y, m), d in g.groupby(["year", "month"]):
        out[f"{y}-{m:02d}"] = [[int(a), int(b), round(float(h), 1), int(round(mo)), int(round(v))] for a, b, h, mo, v in
                               zip(d["la"], d["lo"], d["harmonized_count"], d["modis_count"], d["viirs_count"])]
    return out


def raw_series(cal: pd.DataFrame) -> dict:
    """Yearly raw counts MODIS (Terra+Aqua) vs Suomi NPP, 2001-2025, for the 3D chart in 'Problem'."""
    res = {}
    ua = ROOT / "analysis/out/raw_series_ukraine.csv"
    if ua.exists():
        u = pd.read_csv(ua)
        check_cols(u, ["year", "MODIS", "VIIRS (Suomi NPP)"], "raw_series_ukraine.csv")
        res["ukraine"] = [{"year": int(r.year), "modis": int(r.MODIS), "viirs": int(r[2])}
                          for r in u.itertuples(index=False)]
    w = cal[(cal.region_id == "WORLD") & cal.year.between(2001, 2025)]
    if len(w):
        yw = w.groupby("year")[["modis_count", "viirs_count"]].sum(min_count=1).fillna(0)
        res["world"] = [{"year": int(y), "modis": int(round(r.modis_count)), "viirs": int(round(r.viirs_count))}
                        for y, r in yw.iterrows()]
    for v in res.values():
        for r in v:
            r["ratio"] = round(r["viirs"] / r["modis"], 2) if r["viirs"] and r["modis"] else None
    return res


def validation_series() -> dict:
    """Held-out 2021-2025 monthly totals: real Suomi NPP vs MODIS scaled vs raw MODIS (Yehor's model/out)."""
    res = {}
    for key, name in [("ukraine", "validation_UKR.csv"), ("world", "validation_world.csv")]:
        p = ROOT / "model/out" / name
        if p.exists():
            v = pd.read_csv(p)
            check_cols(v, ["year", "month", "snpp", "modis_scaled", "modis_raw"], name)
            res[key] = [{"year": int(r.year), "month": int(r.month), "snpp": round(float(r.snpp), 1),
                         "modis_scaled": round(float(r.modis_scaled), 1), "modis_raw": round(float(r.modis_raw), 1)}
                        for r in v.itertuples(index=False)]
    return res


def metrics_block(path: Path):
    if not path.exists():
        return None
    m = json.loads(path.read_text(encoding="utf-8"))
    t, raw = m.get("monthly_totals", {}), m.get("raw_modis_vs_snpp_monthly_totals", {})
    return {"mae": t.get("mae"), "r2": t.get("r2"), "wape_pct": t.get("wape_pct"), "bias_pct": t.get("bias_pct"),
            "n_months": t.get("n"), "train_years": m.get("train_years", "2012-2020"),
            "test_years": m.get("test_years", "2021-2025"),
            "raw_modis": {"r2": raw.get("r2"), "bias_pct": raw.get("bias_pct"), "wape_pct": raw.get("wape_pct")},
            "cells": m.get("cell_months"), "source": str(path.relative_to(ROOT)).replace("\\", "/")}


def bbox_of(geom) -> list:
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]


def main():
    ap = argparse.ArgumentParser(description="Export pipeline output to frontend/public/data")
    ap.add_argument("--world-grid", type=Path, help="grid_harmonized_world.csv.gz")
    ap.add_argument("--cell-country", type=Path, help="cell_country.csv")
    args = ap.parse_args()

    fires_paths = sorted((ROOT / "data").glob("fires_v2_*.csv.gz"))
    if not fires_paths:
        sys.exit("Missing input: data/fires_v2_*.csv.gz")
    fires = pd.concat(pd.read_csv(p, dtype={"date": str}) for p in fires_paths)
    check_cols(fires, ["date", "lat", "lon", "sensor", "satellite", "frp", "region"], "fires_v2")
    fires["year"] = fires["date"].str[:4].astype(int)
    fires["month"] = fires["date"].str[5:7].astype(int)

    ua = ukraine_calendar()
    last_ym = tuple(ua.iloc[-1][["year", "month"]].astype(int))

    ivan = ROOT / "analysis/out/calendar.csv"
    if ivan.exists():
        cal = pd.read_csv(ivan)
        check_cols(cal, ["region_id", "year", "month", "modis_count", "viirs_count", "harmonized_count",
                         "median_count", "anomaly"], "analysis/out/calendar.csv")
        source = "analysis/out/calendar.csv (analysis/build_calendar.py, national Terra/Aqua weights)"
    else:
        cal = add_stats(pd.concat([ua, oblast_calendars(fires, last_ym)], ignore_index=True))
        source = "computed in backend/export_static.py from Yehor's coefficients"

    # ---------- checks ----------
    obl = cal[cal.region_id != "UKR"]
    u2 = cal[cal.region_id == "UKR"].set_index(["year", "month"])["harmonized_count"]
    s2 = obl.groupby(["year", "month"])["harmonized_count"].sum()
    snpp_years = u2.index.get_level_values(0) >= 2013
    gap = (s2.reindex(u2.index) - u2).abs()
    print(f"Sum of oblasts vs UKR, 2013+: max |diff| = {gap[snpp_years].max():.1f} hotspots/month "
          f"(UKR uses the 0.25° grid, oblasts use point-in-polygon; small border differences expected)")
    if cal["harmonized_count"].isna().any() or (cal["harmonized_count"] < 0).any():
        sys.exit("harmonized_count has empty or negative values")

    # ---------- world (optional) ----------
    world_meta = []
    if args.world_grid:
        if not args.cell_country:
            sys.exit("--world-grid needs --cell-country")
        wcal, world_meta = world_calendars(need(args.world_grid), need(args.cell_country))
        wcal = add_stats(wcal)
        cal = pd.concat([cal, wcal], ignore_index=True)
        print(f"World: {len(world_meta) - 1} countries + WORLD, {int(wcal.year.min())}-{int(wcal.year.max())}")

    # ---------- write ----------
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    def write(rel, obj):
        p = OUT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")

    def rows(df):
        df = df.astype(object).where(pd.notna(df), None)
        return [{k: (int(v) if isinstance(v, (np.integer,)) else float(v) if isinstance(v, (np.floating,)) else v)
                 for k, v in r.items()} for r in df.to_dict("records")]

    gj = json.loads((ROOT / "data/regions.geojson").read_text(encoding="utf-8"))
    oblasts = sorted(({"id": region_id(f["properties"]["region"]), "name": f["properties"]["region"],
                       "bbox": bbox_of(f["geometry"])} for f in gj["features"]), key=lambda r: r["name"])
    ua_bbox = [min(o["bbox"][0] for o in oblasts), min(o["bbox"][1] for o in oblasts),
               max(o["bbox"][2] for o in oblasts), max(o["bbox"][3] for o in oblasts)]
    write("regions.json", [{"id": "UKR", "name": "Ukraine", "bbox": ua_bbox}] + oblasts + world_meta)

    cols = ["region_id", "year", "month", "modis_count", "viirs_count", "harmonized_count",
            "median_count", "anomaly"] + [c for c in ["p25_count", "p75_count"] if c in cal.columns]
    for rid, g in cal.groupby("region_id"):
        write(f"calendar/{rid}.json", rows(g.sort_values(["year", "month"])[cols]))

    coef = pd.read_csv(ROOT / "model/out/coefficients_ukraine.csv")
    write("coefficients.json", rows(coef[["month", "k_aqua", "k_terra"]].round(3)))
    write("raw_series.json", raw_series(cal))
    write("validation.json", validation_series())

    world_cell_months = []
    if args.world_grid:
        cells = world_cells(args.world_grid)
        wcal_check = cal[cal.region_id == "WORLD"].set_index(["year", "month"])["harmonized_count"]
        for ym, recs in cells.items():
            write(f"world_cells/{ym}.json", recs)
            world_cell_months.append(ym)
        y, m = 2024, 8
        s = sum(r[2] for r in cells[f"{y}-{m:02d}"])
        print(f"Check 1° cells vs WORLD calendar {y}-{m:02d}: {s:,.0f} vs {wcal_check.loc[(y, m)]:,.0f}")

    metrics = {
        "ukraine": metrics_block(ROOT / "model/out/metrics_UKR.json"),
        "world": metrics_block(ROOT / "model/out/metrics_world.json"),
        "viirs_reference": "Suomi NPP VIIRS (Feb 2012 - Oct 2026). NOAA-20/Suomi NPP ratio measured on 2018-2025 (sum ratio 1.033, monthly median 1.007) for continuing the series after 2 Nov 2026; not yet applied.",
        "notes": ("Trained 2012-2020, tested on unseen 2021-2025: MODIS translated to the Suomi NPP scale vs real "
                  "Suomi NPP, monthly totals. Single 0.25-degree cells (the harmonization grid; the site map sums them into "
                  "1-degree cells) are noisier (few hotspots per cell). "
                  "Winter months before 2012 are noisy (few MODIS detections x large coefficients). "
                  "2026 is preliminary (near-real-time data). Months with Suomi NPP outages (e.g. late Jul-early Aug 2022, "
                  "Jul 2024) are not normalized for observing days and look like low-fire months; without the three "
                  "such test months, Ukraine R2 is 0.98 and bias -0.7 %.")}
    write("metrics.json", metrics)

    # map points: recent months, one VIIRS satellite + MODIS
    pts = fires[(fires["date"].str[:7] >= FIRE_MONTHS_FROM) & fires["satellite"].isin(POINT_SATS)].copy()
    pts["region_id"] = pts["region"].map(region_id)
    pts["ym"] = pts["date"].str[:7]
    fire_months = []
    for ym, g in pts.groupby("ym"):
        recs = [{"lat": round(float(r.lat), 4), "lon": round(float(r.lon), 4),
                 "frp": None if pd.isna(r.frp) else float(r.frp), "sensor": r.sensor, "satellite": r.satellite,
                 "date": r.date, "region_id": r.region_id} for r in g.itertuples()]
        write(f"fires/UA/{ym}.json", recs)
        fire_months.append(ym)

    files = sorted(str(p.relative_to(OUT)).replace("\\", "/") for p in OUT.rglob("*.json"))
    write("manifest.json", {
        "fake": False, "contract": "v2", "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "calendar_source": source, "last_complete_month": f"{last_ym[0]}-{last_ym[1]:02d}",
        "preliminary_from": "2026-01", "fire_months": fire_months,
        "world_cell_deg": 1, "world_cell_months": world_cell_months, "files": files})

    (OUT / "README.md").write_text(
        "# frontend/public/data — data for the site\n\n"
        f"Generated by `python backend/export_static.py` on {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC. "
        "Do not edit by hand — re-run the script. Format: contract v2 in `CLAUDE.md`.\n\n"
        "| File | Content |\n|---|---|\n"
        "| `manifest.json` | `fake`, generation time, calendar source, last complete month, `fire_months`, file list |\n"
        "| `regions.json` | `[{id, name, bbox}]`: `UKR` and 27 oblasts (`UKR-Kyiv`, `UKR-Kyiv-City`, `UKR-Crimea`, ...) |\n"
        "| `calendar/<region_id>.json` | rows `{region_id, year, month, modis_count, viirs_count, harmonized_count, "
        "median_count, anomaly, p25_count, p75_count}` |\n"
        "| `coefficients.json` | `[{month, k_aqua, k_terra}]` — MODIS → Suomi NPP coefficients (Yehor) |\n"
        "| `metrics.json` | validation on unseen years 2021–2025 (`null` until the analyst finishes) |\n"
        f"| `fires/UA/<YYYY-MM>.json` | hotspots of Ukraine (Terra, Aqua, Suomi NPP) from {FIRE_MONTHS_FROM} |\n\n"
        f"Calendar source: {source}. 2026 is preliminary (FIRMS near-real-time data).\n",
        encoding="utf-8")

    FIG_OUT.mkdir(parents=True, exist_ok=True)
    fig = ROOT / "docs/figures/raw_series_ukraine.png"
    if fig.exists():
        shutil.copy2(fig, FIG_OUT / fig.name)

    size = sum(p.stat().st_size for p in OUT.rglob("*.json")) / 1e6
    print(f"Calendar source: {source}")
    print(f"Wrote {len(files) + 1} files, {size:.1f} MB -> {OUT.relative_to(ROOT)}; "
          f"regions: {1 + len(oblasts)}; point months: {len(fire_months)} ({fire_months[0]}..{fire_months[-1]})")


if __name__ == "__main__":
    main()
