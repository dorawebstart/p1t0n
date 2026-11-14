"""Перевірка точності гармонізації по Україні на роках, яких модель не бачила (2021–2025).

Виконано за задачею аналітика (Іван) — Єгор Крупіца разом із Claude Code.
Parts of this code were written with the assistance of AI (Claude).

Важливо: з 2012 року harmonized_count = справжній SNPP, тому порівнюємо modis_scaled (MODIS,
перерахований у шкалу SNPP коефіцієнтами 2012–2020) із snpp.

Запуск з кореня репозиторію (спершу python model/harmonize.py — він створює detail-файл):
    python analysis/validate_harmonization.py
Вхід:   model/out/ukraine_monthly_detail.csv
Вихід:  analysis/out/validation_ukraine.json       — MAE, WAPE, зміщення, R² (місяці й роки; 2021–23 vs 2024–25)
        analysis/out/validation_ukraine_monthly.csv — year, month, modis_raw, snpp, modis_scaled
        docs/figures/harmonized_ukraine.png        — «до / після»: сирий MODIS, SNPP, MODIS у шкалі SNPP
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

SRC = "model/out/ukraine_monthly_detail.csv"
TEST = (2021, 2025)
OUT_JSON = "analysis/out/validation_ukraine.json"
OUT_CSV = "analysis/out/validation_ukraine_monthly.csv"
OUT_PNG = "docs/figures/harmonized_ukraine.png"
COLORS = {"modis": "#0072B2", "snpp": "#E69F00", "scaled": "#D55E00"}  # Okabe–Ito


def scores(pred, act):
    pred, act = np.asarray(pred, float), np.asarray(act, float)
    ss_res, ss_tot = ((act - pred) ** 2).sum(), ((act - act.mean()) ** 2).sum()
    return {
        "mae": round(float(np.abs(pred - act).mean()), 1),
        "wape_pct": round(float(100 * np.abs(pred - act).sum() / act.sum()), 1),
        "bias_pct": round(float(100 * (pred - act).sum() / act.sum()), 1),
        "r2": round(float(1 - ss_res / ss_tot), 3),
        "n": int(len(act)),
    }


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"{SRC} not found: run  python model/harmonize.py  first")
    d = pd.read_csv(SRC)
    d = d[~d["partial_month"]]
    d["modis_raw"] = d["terra"].fillna(0) + d["aqua"].fillna(0)
    t = d[d.year.between(*TEST)].copy()
    t = t[["year", "month", "modis_raw", "snpp", "modis_scaled"]]
    os.makedirs("analysis/out", exist_ok=True)
    t.to_csv(OUT_CSV, index=False)

    annual = t.groupby("year")[["modis_raw", "snpp", "modis_scaled"]].sum()
    early, late = t[t.year <= 2023], t[t.year >= 2024]
    res = {
        "test_years": f"{TEST[0]}-{TEST[1]}",
        "train_years": "2012-2020",
        "monthly": {"harmonized": scores(t.modis_scaled, t.snpp), "raw_modis": scores(t.modis_raw, t.snpp)},
        "annual": {"harmonized": scores(annual.modis_scaled, annual.snpp),
                   "raw_modis": scores(annual.modis_raw, annual.snpp)},
        "monthly_2021_2023": scores(early.modis_scaled, early.snpp),
        "monthly_2024_2025": scores(late.modis_scaled, late.snpp),
        "annual_totals": {int(y): {"snpp": int(r.snpp), "modis_scaled": round(float(r.modis_scaled)),
                                   "modis_raw": int(r.modis_raw),
                                   "error_pct": round(float(100 * (r.modis_scaled / r.snpp - 1)), 1)}
                          for y, r in annual.iterrows()},
    }
    # Як змінюється відношення SNPP / MODIS із роками (дрейф)
    full = d[d.year.between(2013, 2025)].groupby("year")[["snpp", "modis_raw"]].sum()
    res["snpp_per_modis_by_year"] = {int(y): round(float(r.snpp / r.modis_raw), 2) for y, r in full.iterrows()}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)

    # Графік «до / після»: річні суми 2001–2025
    a = d[d.year.between(2001, 2025)].groupby("year").agg(
        modis_raw=("modis_raw", "sum"), snpp=("snpp", lambda s: s.sum(min_count=1)),
        harmonized=("harmonized_count", "sum"), modis_scaled=("modis_scaled", "sum"))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4.8), gridspec_kw={"width_ratios": [1.4, 1]})
    a1.plot(a.index, a.modis_raw / 1000, color=COLORS["modis"], lw=1.8, marker="o", ms=3,
            label="MODIS raw (Terra + Aqua)")
    a1.plot(a.index, a.snpp / 1000, color=COLORS["snpp"], lw=2.2, marker="o", ms=3, label="VIIRS Suomi NPP (real)")
    a1.plot(a.index, a.modis_scaled / 1000, color=COLORS["scaled"], lw=1.4, ls="--",
            label="MODIS harmonized to Suomi NPP scale")
    a1.axvline(2011.5, color="0.6", lw=0.8, ls=":")
    a1.axvspan(TEST[0] - 0.5, TEST[1] + 0.5, color="0.85", alpha=0.5, lw=0)
    a1.text(TEST[0] - 0.3, a1.get_ylim()[1] * 0.93, "held-out\ntest years", fontsize=8, color="0.35")
    a1.set_ylabel("Hotspots per year, Ukraine (thousands)")
    a1.set_title("Before / after harmonization", loc="left")
    a1.legend(frameon=False, fontsize=8, loc="upper left")

    lim = max(t.snpp.max(), t.modis_scaled.max()) * 1.05
    a2.plot([1, lim], [1, lim], color="0.6", lw=0.8)
    a2.scatter(t.snpp, t.modis_raw, s=14, color=COLORS["modis"], alpha=0.7, label="MODIS raw")
    a2.scatter(t.snpp, t.modis_scaled, s=14, color=COLORS["scaled"], alpha=0.8, label="MODIS harmonized")
    a2.set_xscale("log"); a2.set_yscale("log")
    a2.set_xlabel("Real Suomi NPP hotspots per month")
    a2.set_ylabel("Predicted from MODIS")
    m = res["monthly"]
    a2.set_title(f"Test months {TEST[0]}-{TEST[1]}: R² {m['raw_modis']['r2']:.2f} → {m['harmonized']['r2']:.2f}",
                 loc="left", fontsize=10)
    a2.legend(frameon=False, fontsize=8)
    fig.text(0.01, 0.005, "NASA FIRMS: MODIS C6.1 (Terra, Aqua), VIIRS 375 m Suomi NPP (VNP14IMG). Coefficients "
             "trained on 2012-2020, checked on 2021-2025.", fontsize=8, color="0.35")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    os.makedirs("docs/figures", exist_ok=True)
    fig.savefig(OUT_PNG, dpi=150)

    print(json.dumps({k: res[k] for k in ["monthly", "annual", "monthly_2021_2023", "monthly_2024_2025"]}, indent=1))
    print("annual:", json.dumps(res["annual_totals"]))
    print("SNPP/MODIS by year:", res["snpp_per_modis_by_year"])


if __name__ == "__main__":
    main()
