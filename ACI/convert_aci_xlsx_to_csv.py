"""Convert ACI mileage xlsx table to the CSV format expected by the /api/aci/import endpoint.

Expected CSV columns: year, make, model, fuel, variant, costPerKm

Mapping from the xlsx:
  year       <- extracted from the filename (e.g. "...-2026-...")
  make       <- "Marca"
  model      <- "Modello"
  fuel       <- derived from the sheet name (e.g. "Benzina IN" -> "Benzina")
  variant    <- "ID Modello"  (ACI numeric ID; uniquely identifies each engine variant)
  costPerKm  <- "COSTO KM 15.000 KM"
"""

import csv
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")

# Column indices in the xlsx (0-based)
COL_ID_MODELLO = 0
COL_MARCA = 1
COL_MODELLO = 2
COL_COSTO_KM = 3


def extract_year(filename: str) -> int:
    m = re.search(r"(\d{4})", filename)
    if not m:
        sys.exit(f"Cannot extract year from filename: {filename}")
    return int(m.group(1))


def fuel_from_sheet(sheet_name: str) -> str:
    # "Benzina IN" -> "Benzina", "Diesel IN" -> "Diesel", etc.
    return sheet_name.split()[0].capitalize()


def convert(xlsx_path: Path, csv_path: Path) -> int:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active

    year = extract_year(xlsx_path.name)
    fuel = fuel_from_sheet(ws.title)

    rows_written = 0
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["year", "make", "model", "fuel", "variant", "costPerKm"])

        first = True
        for row in ws.iter_rows(values_only=True):
            if first:
                first = False
                continue  # skip header row
            id_modello = row[COL_ID_MODELLO]
            make = row[COL_MARCA]
            model = row[COL_MODELLO]
            cost = row[COL_COSTO_KM]
            # Skip rows that don't look like data (None id or cost)
            if id_modello is None or cost is None:
                continue
            # Round costPerKm to 4 decimal places to avoid float noise
            cost_str = f"{float(cost):.4f}"
            writer.writerow([year, make, model, fuel, int(id_modello), cost_str])
            rows_written += 1

    wb.close()
    return rows_written


if __name__ == "__main__":
    here = Path(__file__).parent
    xlsx = here / "Tabelle-ACI-2026-Autoveicoli-benzina-in-produzione.xlsx"
    csv_out = xlsx.with_suffix(".csv")

    if not xlsx.exists():
        sys.exit(f"File not found: {xlsx}")

    n = convert(xlsx, csv_out)
    print(f"Converted {n} rows -> {csv_out}")
