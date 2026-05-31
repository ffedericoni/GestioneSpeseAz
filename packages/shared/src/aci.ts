// Pure ACI domain: framework- and I/O-free. CSV *parsing* (text -> rows) lives
// in the server's aci module; this file only validates already-parsed rows and
// holds the mileage-tolerance constants shared by both tiers.

export const MILEAGE_TOLERANCE_KEY = "mileageTolerancePercent";
export const DEFAULT_TOLERANCE_PERCENT = 10;

// Stored Setting value -> integer percent. Defaults (and self-heals from any
// bad stored value) to DEFAULT_TOLERANCE_PERCENT.
export function parseTolerancePercent(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return DEFAULT_TOLERANCE_PERCENT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) return DEFAULT_TOLERANCE_PERCENT;
  return n;
}

export interface AciRateInput {
  year: number;
  make: string;
  model: string;
  fuel: string;
  variant: string;
  // Kept as the validated decimal string to avoid float drift; Prisma's Decimal
  // column accepts a string exactly.
  costPerKm: string;
}

export type AciRowResult =
  | { ok: true; value: AciRateInput }
  | { ok: false; errors: string[] };

const REQUIRED_TEXT = ["make", "model", "fuel", "variant"] as const;

// Validate one parsed CSV row (keys are the header names). Italian messages.
export function validateAciRow(raw: Record<string, string | undefined>): AciRowResult {
  const errors: string[] = [];

  const year = Number((raw.year ?? "").trim());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.push("Anno non valido (atteso un intero tra 2000 e 2100).");
  }

  const text: Record<string, string> = {};
  for (const key of REQUIRED_TEXT) {
    const v = (raw[key] ?? "").trim();
    if (!v) errors.push(`Campo obbligatorio mancante: ${key}.`);
    text[key] = v;
  }

  const costRaw = (raw.costPerKm ?? "").trim();
  const cost = Number(costRaw);
  if (!costRaw || !Number.isFinite(cost) || cost <= 0) {
    errors.push("costPerKm deve essere un numero positivo.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      year,
      make: text.make,
      model: text.model,
      fuel: text.fuel,
      variant: text.variant,
      costPerKm: costRaw,
    },
  };
}
