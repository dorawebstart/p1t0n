"""Місток NOAA-20 → Suomi NPP по Україні: наскільки NOAA-20 можна підставити замість SNPP після 2.11.2026.

Виконано за задачею аналітика (Іван) — Єгор Крупіца разом із Claude Code.
Parts of this code were written with the assistance of AI (Claude).

Запуск з кореня репозиторію:  python analysis/bridge_noaa20.py
Вхід:   data/grid_monthly_UKR_v1.csv.gz
Вихід:  analysis/out/bridge_noaa20.csv        — year, month, snpp, noaa20, ratio (NOAA20 / SNPP)
        analysis/out/bridge_noaa20_summary.json — медіана, 25–75 %, сумарне відношення
        docs/figures/bridge_noaa20.png         — помісячні суми й відношення

Відношення рахуємо для кожного місяця 2018–2025, де обидва супутники > 0 (суми по Україні).
Для перерахунку NOAA-20 у шкалу SNPP: snpp_equiv = noaa20 / ratio.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

SRC = "data/grid_monthly_UKR_v1.csv.gz"
FIRST, LAST = 2018, 2025
OUT_CSV = "analysis/out/bridge_noaa20.csv"
OUT_JSON = "analysis/out/bridge_noaa20_summary.json"
OUT_PNG = "docs/figures/bridge_noaa20.png"
COLORS = {"SNPP": "#E69F00", "NOAA20": "#009E73"}  # Okabe–Ito


def main():
    g = pd.read_csv(SRC, usecols=["year", "month", "satellite", "count"])
    g = g[g.satellite.isin(["SNPP", "NOAA20"]) & g.year.between(FIRST, LAST)]
    m = g.groupby(["year", "month", "satellite"])["count"].sum().unstack(fill_value=0).reset_index()
    m = m.rename(columns={"SNPP": "snpp", "NOAA20": "noaa20"})
    m = m[(m.snpp > 0) & (m.noaa20 > 0)].copy()
    m["ratio"] = (m.noaa20 / m.snpp).round(4)
    os.makedirs("analysis/out", exist_ok=True)
    m[["year", "month", "snpp", "noaa20", "ratio"]].to_csv(OUT_CSV, index=False)

    annual = m.groupby("year")[["snpp", "noaa20"]].sum()
    annual["ratio"] = (annual.noaa20 / annual.snpp).round(4)
    big = m[m.snpp >= 1000]
    summary = {
        "period": f"{FIRST}-{LAST}",
        "months": int(len(m)),
        "ratio_median": round(float(m.ratio.median()), 4),
        "ratio_p25": round(float(m.ratio.quantile(0.25)), 4),
        "ratio_p75": round(float(m.ratio.quantile(0.75)), 4),
        "ratio_of_sums": round(float(m.noaa20.sum() / m.snpp.sum()), 4),
        "ratio_median_months_snpp_ge_1000": round(float(big.ratio.median()), 4),
        "ratio_p25_p75_months_snpp_ge_1000": [round(float(big.ratio.quantile(q)), 4) for q in (0.25, 0.75)],
        "annual": {int(y): {"snpp": int(r.snpp), "noaa20": int(r.noaa20), "ratio": float(r.ratio)}
                   for y, r in annual.iterrows()},
        "how_to_use": "snpp_equivalent = noaa20 / ratio_of_sums (Ukraine, monthly totals)",
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    t = pd.to_datetime(dict(year=m.year, month=m.month, day=15))
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(10, 6.5), sharex=True, gridspec_kw={"height_ratios": [2, 1]})
    a1.plot(t, m.snpp, color=COLORS["SNPP"], lw=1.6, label="VIIRS Suomi NPP")
    a1.plot(t, m.noaa20, color=COLORS["NOAA20"], lw=1.2, ls="--", label="VIIRS NOAA-20")
    a1.set_yscale("log")
    a1.set_ylabel("Hotspots per month, Ukraine")
    a1.legend(frameon=False)
    a1.set_title("NOAA-20 tracks Suomi NPP: the record can continue after 2 Nov 2026", loc="left")
    a2.axhline(1, color="0.6", lw=0.8)
    a2.axhspan(summary["ratio_p25"], summary["ratio_p75"], color=COLORS["NOAA20"], alpha=0.15,
               label=f"25–75 %: {summary['ratio_p25']:.2f}–{summary['ratio_p75']:.2f}")
    sizes = np.clip(np.sqrt(m.snpp) / 4, 4, 60)
    a2.scatter(t, m.ratio, s=sizes, color=COLORS["NOAA20"], alpha=0.8)
    a2.set_ylabel("NOAA-20 / SNPP")
    a2.set_ylim(0, 2.5)
    a2.legend(frameon=False, loc="upper left")
    fig.text(0.01, 0.005, f"NASA FIRMS VIIRS 375 m (VNP14IMG, VJ114IMG), {FIRST}-{LAST}. Dot size ~ number of "
             f"hotspots. Ratio of sums = {summary['ratio_of_sums']:.3f}.", fontsize=8, color="0.35")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    os.makedirs("docs/figures", exist_ok=True)
    fig.savefig(OUT_PNG, dpi=150)

    print(f"{len(m)} months; median ratio {summary['ratio_median']} "
          f"(25-75 %: {summary['ratio_p25']}-{summary['ratio_p75']}); ratio of sums {summary['ratio_of_sums']}")
    print(annual.to_string())


if __name__ == "__main__":
    main()
