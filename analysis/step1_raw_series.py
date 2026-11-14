"""Крок 1 аналітика: «сирі ряди» MODIS і Suomi NPP по Україні — показує хибний стрибок 2012 року.

Автор першої версії: Іван Кніжницький (аналітик). Виправлення (фільтр супутників, річний графік):
капітан. Parts of this code were written with the assistance of AI tools (Gemini, Claude Code).

Важливо: VIIRS = ЛИШЕ Suomi NPP (еталон, див. CLAUDE.md). NOAA-20 / NOAA-21 не додаємо —
інакше з 2018 року кількість VIIRS подвоюється і з'являється другий хибний стрибок.

Запуск з кореня репозиторію:  python analysis/step1_raw_series.py
Вхід:   data/grid_monthly_UKR_v1.csv.gz
Вихід:  docs/figures/raw_series_ukraine.png          — річні суми + співвідношення (для слайда 2)
        docs/figures/raw_series_ukraine_monthly.png  — 12-місячна ковзна сума
        analysis/out/raw_series_ukraine.csv          — річні суми (для тексту й перевірки)
"""
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

SRC = "data/grid_monthly_UKR_v1.csv.gz"
FIRST_YEAR, LAST_YEAR = 2001, 2025  # 2000 — лише лист.–груд. (Terra), 2026 — неповний рік
KEEP = {"Terra": "MODIS", "Aqua": "MODIS", "SNPP": "VIIRS (Suomi NPP)"}
# Кольори Okabe–Ito — читаються при дальтонізмі
COLORS = {"MODIS": "#0072B2", "VIIRS (Suomi NPP)": "#E69F00"}


def load() -> pd.DataFrame:
    df = pd.read_csv(SRC)
    expected = {"year", "month", "satellite", "count"}
    missing = expected - set(df.columns)
    if missing:
        raise ValueError(f"У {SRC} немає колонок {missing}; є {list(df.columns)}")
    df = df[df["satellite"].isin(KEEP)].copy()
    df["series"] = df["satellite"].map(KEEP)
    return df


def main() -> None:
    os.makedirs("docs/figures", exist_ok=True)
    os.makedirs("analysis/out", exist_ok=True)
    df = load()

    # ---------- річні суми ----------
    yearly = (df[df["year"].between(FIRST_YEAR, LAST_YEAR)]
              .groupby(["year", "series"])["count"].sum().unstack(fill_value=0))
    yearly = yearly.reindex(columns=list(COLORS), fill_value=0)
    yearly["ratio_viirs_to_modis"] = (yearly["VIIRS (Suomi NPP)"] / yearly["MODIS"]).where(yearly.index >= 2012).round(2)
    yearly.to_csv("analysis/out/raw_series_ukraine.csv")

    fig, ax = plt.subplots(figsize=(12, 6))
    x = yearly.index.to_numpy()
    w = 0.4
    ax.bar(x - w / 2, yearly["MODIS"], w, label="MODIS (Terra + Aqua)", color=COLORS["MODIS"])
    ax.bar(x + w / 2, yearly["VIIRS (Suomi NPP)"], w, label="VIIRS (Suomi NPP)", color=COLORS["VIIRS (Suomi NPP)"])
    ax.axvline(2011.5, color="#444", linestyle="--", linewidth=1)
    ax.text(2011.3, ax.get_ylim()[1] * 0.75, "2012: VIIRS starts →\nfalse jump if added up", va="top", ha="right", fontsize=10)
    ax.set_title("Ukraine: raw yearly hotspot counts — the two sensors cannot simply be added",
                 fontsize=14, fontweight="bold")
    ax.set_xlabel("Year")
    ax.set_ylabel("Hotspots per year (vegetation fires, type = 0)")
    ax.set_xticks(x[::2])
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    ax2 = ax.twinx()
    ax2.plot(x, yearly["ratio_viirs_to_modis"], color="#CC79A7", marker="o", linewidth=2, label="VIIRS / MODIS")
    ax2.set_ylabel("VIIRS / MODIS ratio", color="#CC79A7")
    ax2.set_ylim(0, max(6, (yearly["ratio_viirs_to_modis"].max() or 0) * 1.3))

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="upper left")
    fig.text(0.01, 0.01, "Source: NASA FIRMS, MODIS C6.1 and VIIRS 375 m (Suomi NPP), Standard Processing. Team P1t0n.",
             fontsize=8, color="#555")
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig("docs/figures/raw_series_ukraine.png", dpi=200)
    plt.close(fig)

    # ---------- помісячно: 12-місячна ковзна сума (прибирає сезонність) ----------
    monthly = (df[df["year"] <= LAST_YEAR]
               .groupby(["year", "month", "series"])["count"].sum().unstack(fill_value=0)
               .reindex(columns=list(COLORS), fill_value=0))
    monthly.index = pd.PeriodIndex([f"{y}-{m:02d}" for y, m in monthly.index], freq="M")
    monthly = monthly.reindex(pd.period_range(monthly.index.min(), monthly.index.max(), freq="M"), fill_value=0)
    rolling = monthly.rolling(12).sum()
    rolling.loc[rolling.index < pd.Period("2013-01", "M"), "VIIRS (Suomi NPP)"] = float("nan")  # VIIRS з 20.01.2012

    fig, ax = plt.subplots(figsize=(12, 5))
    for col in COLORS:
        ax.plot(rolling.index.to_timestamp(), rolling[col], label=col, color=COLORS[col], linewidth=2)
    ax.set_title("Ukraine: 12-month rolling sum of hotspots (raw, not harmonized)", fontsize=13, fontweight="bold")
    ax.set_ylabel("Hotspots in the previous 12 months")
    ax.grid(linestyle="--", alpha=0.5)
    ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig("docs/figures/raw_series_ukraine_monthly.png", dpi=200)
    plt.close(fig)

    print(yearly.to_string())
    print("\nЗбережено: docs/figures/raw_series_ukraine.png, docs/figures/raw_series_ukraine_monthly.png, "
          "analysis/out/raw_series_ukraine.csv")


if __name__ == "__main__":
    main()
