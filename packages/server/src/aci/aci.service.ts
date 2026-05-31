import { parse } from "csv-parse/sync";
import { prisma } from "../db.js";
import { validateAciRow, type AciRateInput } from "@gsa/shared";

export interface ImportRowError {
  row: number; // 1-based line number in the file (header is line 1)
  messages: string[];
}

export interface ImportBatchSummary {
  id: string;
  year: number;
  fileName: string;
  rowCount: number;
  importedAt: Date;
}

export type ImportResult =
  | { ok: true; batch: ImportBatchSummary }
  | { ok: false; errors: ImportRowError[] };

export async function importAciCsv(
  csvText: string,
  fileName: string,
  importedById: string,
): Promise<ImportResult> {
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return { ok: false, errors: [{ row: 1, messages: ["File CSV non valido."] }] };
  }
  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 1, messages: ["Il file non contiene righe di dati."] }] };
  }

  const valid: AciRateInput[] = [];
  const errors: ImportRowError[] = [];
  rows.forEach((raw, i) => {
    const result = validateAciRow(raw);
    if (result.ok) valid.push(result.value);
    else errors.push({ row: i + 2, messages: result.errors }); // +2: skip header, 1-based
  });
  if (errors.length > 0) return { ok: false, errors };

  const year = valid[0].year;
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.aciImportBatch.create({
      data: { year, fileName, rowCount: valid.length, importedById },
    });
    for (const r of valid) {
      await tx.aciRate.upsert({
        where: {
          year_make_model_fuel_variant: {
            year: r.year,
            make: r.make,
            model: r.model,
            fuel: r.fuel,
            variant: r.variant,
          },
        },
        update: { costPerKm: r.costPerKm, importBatchId: b.id },
        create: {
          year: r.year,
          make: r.make,
          model: r.model,
          fuel: r.fuel,
          variant: r.variant,
          costPerKm: r.costPerKm,
          importBatchId: b.id,
        },
      });
    }
    return b;
  });

  return {
    ok: true,
    batch: {
      id: batch.id,
      year: batch.year,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
      importedAt: batch.importedAt,
    },
  };
}
