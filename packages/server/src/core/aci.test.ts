import { describe, it, expect } from "vitest";
import {
  validateAciRow,
  parseTolerancePercent,
  DEFAULT_TOLERANCE_PERCENT,
  MILEAGE_TOLERANCE_KEY,
} from "@gsa/shared";

describe("validateAciRow", () => {
  const good = {
    year: "2026",
    make: "Fiat",
    model: "Panda",
    fuel: "Benzina",
    variant: "1.2",
    costPerKm: "0.6543",
  };

  it("maps a valid row to an AciRateInput (costPerKm kept as string)", () => {
    const r = validateAciRow(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        year: 2026,
        make: "Fiat",
        model: "Panda",
        fuel: "Benzina",
        variant: "1.2",
        costPerKm: "0.6543",
      });
    }
  });

  it("rejects a non-integer / out-of-range year", () => {
    expect(validateAciRow({ ...good, year: "abc" }).ok).toBe(false);
    expect(validateAciRow({ ...good, year: "1990" }).ok).toBe(false);
  });

  it("rejects an empty required field", () => {
    const r = validateAciRow({ ...good, make: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/make/);
  });

  it("rejects a non-positive or non-numeric costPerKm", () => {
    expect(validateAciRow({ ...good, costPerKm: "0" }).ok).toBe(false);
    expect(validateAciRow({ ...good, costPerKm: "-1" }).ok).toBe(false);
    expect(validateAciRow({ ...good, costPerKm: "x" }).ok).toBe(false);
  });

  it("collects multiple errors at once", () => {
    const r = validateAciRow({ year: "x", make: "", model: "", fuel: "", variant: "", costPerKm: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(1);
  });
});

describe("parseTolerancePercent", () => {
  it("returns the default when absent or blank", () => {
    expect(parseTolerancePercent(null)).toBe(DEFAULT_TOLERANCE_PERCENT);
    expect(parseTolerancePercent(undefined)).toBe(DEFAULT_TOLERANCE_PERCENT);
    expect(parseTolerancePercent("")).toBe(DEFAULT_TOLERANCE_PERCENT);
  });

  it("parses a valid integer percent", () => {
    expect(parseTolerancePercent("15")).toBe(15);
    expect(parseTolerancePercent("0")).toBe(0);
  });

  it("falls back to the default for out-of-range or non-integer values", () => {
    expect(parseTolerancePercent("150")).toBe(DEFAULT_TOLERANCE_PERCENT);
    expect(parseTolerancePercent("-5")).toBe(DEFAULT_TOLERANCE_PERCENT);
    expect(parseTolerancePercent("12.5")).toBe(DEFAULT_TOLERANCE_PERCENT);
  });

  it("exposes the storage key constant", () => {
    expect(MILEAGE_TOLERANCE_KEY).toBe("mileageTolerancePercent");
  });
});
