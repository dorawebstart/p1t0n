import os
import glob
import pandas as pd
import matplotlib.pyplot as plt

def main():
    # Переконуємося, що тека для графіків існує
    os.makedirs('docs/figures', exist_ok=True)
    
    data_path = 'data/grid_monthly_UKR_v1.csv.gz'
    if not os.path.exists(data_path):
        files = glob.glob('data/fires_v2_*.csv.gz')
        if files:
            data_path = files[0]
        else:
            raise FileNotFoundError("Не знайдено жодного файлу даних у теці data/ за шаблоном fires_v2_*.csv.gz або grid_monthly_UKR_v1.csv.gz")

    print(f"Зчитування даних з: {data_path}")
    df = pd.read_csv(data_path)

    # Обробка залежно від структури (сирі точки або агрегований сітковий файл)
    if 'acq_date' in df.columns:
        df['acq_date'] = pd.to_datetime(df['acq_date'])
        df['year_month'] = df['acq_date'].dt.to_period('M').astype(str)
        sensor_col = 'sensor' if 'sensor' in df.columns else ('instrument' if 'instrument' in df.columns else 'satellite')
        monthly = df.groupby(['year_month', sensor_col]).size().unstack(fill_value=0)
    elif {'year', 'month'}.issubset(df.columns):
        df['year_month'] = df['year'].astype(str) + '-' + df['month'].astype(str).str.zfill(2)
        val_col = 'count' if 'count' in df.columns else df.columns[-1]
        sensor_col = 'sensor' if 'sensor' in df.columns else 'instrument'
        if sensor_col in df.columns:
            monthly = df.groupby(['year_month', sensor_col])[val_col].sum().unstack(fill_value=0)
        else:
            monthly = df.pivot_table(index='year_month', values=val_col, aggfunc='sum')
    else:
        # Універсальний fallback для перевірки колонок
        print("Наявні колонки у файлі:", df.columns.tolist())
        raise ValueError("Неочікувана структура даних у файлі.")

    # Побудова та форматування графіка
    fig, ax = plt.subplots(figsize=(12, 6))
    monthly.plot(ax=ax, linewidth=1.5)
    
    ax.set_title('Raw Monthly Fire Counts in Ukraine (MODIS vs VIIRS/SNPP)', fontsize=14, fontweight='bold')
    ax.set_xlabel('Year-Month', fontsize=12)
    ax.set_ylabel('Hotspot Count', fontsize=12)
    ax.grid(True, linestyle='--', alpha=0.6)
    
    # Скорочуємо кількість підписів по осі X, щоб вони не зливалися
    n_ticks = max(len(monthly) // 12, 1)
    plt.xticks(range(0, len(monthly), max(len(monthly)//15, 1)), monthly.index[::max(len(monthly)//15, 1)], rotation=45, ha='right')
    
    plt.tight_layout()

    output_path = 'docs/figures/raw_series_ukraine.png'
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"Графік успішно збережено у: {output_path}")

if __name__ == '__main__':
    main()
