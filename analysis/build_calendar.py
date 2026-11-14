"""Календар горіння для України (UKR) і 27 областей за контрактом даних (CLAUDE.md, таблиця calendar).

Виконано за задачею аналітика (Іван) — Єгор Крупіца разом із Claude Code.
Parts of this code were written with the assistance of AI (Claude).

Запуск з кореня репозиторію:  python analysis/build_calendar.py
Вхід:   data/fires_v2_*.csv.gz             — точки з колонкою region (область)
        model/out/coefficients_ukraine.csv — k_aqua, k_terra по місяцях (model/harmonize.py)
Вихід:  analysis/out/calendar.csv
        region_id, year, month, modis_count, viirs_count, harmonized_count, median_count, anomaly,
        p25_count, p75_count

Правила:
- 2000-11 .. 2012-01: harmonized = Terra × k_terra та Aqua × k_aqua, зважені частками Terra / Aqua
  в Україні того місяця (як у model/harmonize.py). Ваги — загальноукраїнські, тому перерахунок
  лінійний і сума 27 областей дорівнює UKR. Від 2012-02: harmonized = справжній Suomi NPP.
- Лише повні місяці: останній неповний місяць (листопад 2026) не включено. 2026 рік — дані NRT,
  попередні.
- median_count, p25_count, p75_count — медіана й 25/75 % harmonized_count цієї зони й місяця року
  за всі роки ряду; anomaly = (harmonized_count − median_count) / std того самого місяця (z-score
  відносно медіани). Місяць, де std = 0, має anomaly 0.
- Скрипт перевіряє, що UKR збігається з model/out/ukraine_monthly.csv.
"""
import os
import sys

import numpy as np
import pandas as pd

FIRES = ["data/fires_v2_2000-2015.csv.gz", "data/fires_v2_2016-2026.csv.gz"]
COEF = "model/out/coefficients_ukraine.csv"
UKR_CHECK = "model/out/ukraine_monthly.csv"
OUT = "analysis/out/calendar.csv"
SNPP_FIRST_FULL = (2012, 2)
SATS = ["Terra", "Aqua", "SNPP"]


def region_id(name):
    """Kyiv Oblast -> UKR-Kyiv, Kyiv City -> UKR-Kyiv-City, Autonomous Republic of Crimea -> UKR-Crimea."""
    n = name.replace(" Oblast", "").replace("Autonomous Republic of ", "")
    return "UKR-" + n.replace(" ", "-")


def main():
    f = pd.concat([pd.read_csv(p, usecols=["date", "satellite", "region"], dtype=str) for p in FIRES])
    f = f[f.satellite.isin(SATS)]
    f["year"] = f.date.str[:4].astype(int)
    f["month"] = f.date.str[5:7].astype(int)
    last = f.date.max()
    partial = (int(last[:4]), int(last[5:7]))
    last_day = (pd.Timestamp(last) + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")
    if last != last_day:
        f = f[~((f.year == partial[0]) & (f.month == partial[1]))]
        print(f"Partial month {partial[0]}-{partial[1]:02d} left out")

    f["region_id"] = f.region.map(region_id)
    by_reg = f.groupby(["region_id", "year", "month", "satellite"]).size().unstack("satellite", fill_value=0)
    ukr = f.groupby(["year", "month", "satellite"]).size().unstack("satellite", fill_value=0)

    months = pd.period_range(f"{ukr.index[0][0]}-{ukr.index[0][1]:02d}",
                             f"{ukr.index[-1][0]}-{ukr.index[-1][1]:02d}", freq="M")
    ym = pd.MultiIndex.from_tuples([(p.year, p.month) for p in months], names=["year", "month"])
    ukr = ukr.reindex(ym, fill_value=0)[SATS].astype(float)

    coef = pd.read_csv(COEF).set_index("month")
    tot = ukr.Terra + ukr.Aqua
    w_aqua = (ukr.Aqua / tot.where(tot > 0)).fillna(0.0)
    snpp_ok = pd.Series([(y, m) >= SNPP_FIRST_FULL for y, m in ym], index=ym) & (ukr.SNPP > 0)

    def harmonize(c):
        mo = c.index.get_level_values("month")
        scaled = (w_aqua.values * c.Aqua.values * coef.loc[mo, "k_aqua"].values
                  + (1 - w_aqua.values) * c.Terra.values * coef.loc[mo, "k_terra"].values)
        return pd.DataFrame({
            "modis_count": (c.Terra + c.Aqua).astype(int).values,
            "viirs_count": np.where(snpp_ok.values | (c.SNPP.values > 0), c.SNPP.values, np.nan),
            "harmonized_count": np.where(snpp_ok.values, c.SNPP.values, scaled),
        }, index=c.index)

    tables = {"UKR": harmonize(ukr)}
    for rid in sorted(by_reg.index.get_level_values("region_id").unique()):
        c = by_reg.loc[rid].reindex(ym, fill_value=0).reindex(columns=SATS, fill_value=0).astype(float)
        tables[rid] = harmonize(c)

    # Перевірки: UKR == model/harmonize.py; сума областей == UKR
    if os.path.exists(UKR_CHECK):
        u = pd.read_csv(UKR_CHECK).set_index(["year", "month"])["harmonized_count"]
        d = (tables["UKR"]["harmonized_count"] - u).dropna().abs().max()
        if d > 0.11:
            sys.exit(f"UKR differs from {UKR_CHECK} by up to {d:.2f}")
        print(f"Check passed: UKR == {UKR_CHECK} (max diff {d:.3f}, rounding)")
    reg_sum = sum(t["harmonized_count"] for r, t in tables.items() if r != "UKR")
    d = (reg_sum - tables["UKR"]["harmonized_count"]).abs().max()
    if d > 1e-6:
        sys.exit(f"Sum of oblasts differs from UKR by {d}")
    print(f"Check passed: sum of {len(tables) - 1} oblasts == UKR")

    rows = []
    for rid, t in tables.items():
        t = t.reset_index()
        g = t.groupby("month")["harmonized_count"]
        t["median_count"] = g.transform("median")
        t["p25_count"] = g.transform(lambda s: s.quantile(0.25))
        t["p75_count"] = g.transform(lambda s: s.quantile(0.75))
        sd = g.transform("std")
        t["anomaly"] = ((t.harmonized_count - t.median_count) / sd.where(sd > 0)).fillna(0.0)
        t.insert(0, "region_id", rid)
        rows.append(t)
    cal = pd.concat(rows, ignore_index=True)
    for c in ["harmonized_count", "median_count", "p25_count", "p75_count"]:
        cal[c] = cal[c].round(1)
    cal["anomaly"] = cal["anomaly"].round(2)
    cal["viirs_count"] = cal["viirs_count"].astype("Int64")
    cal = cal[["region_id", "year", "month", "modis_count", "viirs_count", "harmonized_count",
               "median_count", "anomaly", "p25_count", "p75_count"]]
    os.makedirs("analysis/out", exist_ok=True)
    cal.to_csv(OUT, index=False)
    print(f"Saved {len(cal):,} rows, {cal.region_id.nunique()} zones, "
          f"{cal.year.min()}-{cal.month[cal.year == cal.year.min()].min():02d} .. "
          f"{cal.year.max()}-{cal.month[cal.year == cal.year.max()].max():02d} to {OUT}")


if __name__ == "__main__":
    main()
