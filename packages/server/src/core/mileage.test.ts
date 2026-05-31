import { describe, it, expect } from "vitest";
import {
  computeBaselineKm,
  toleranceRange,
  evaluateEnteredKm,
  mileageAmountCents,
} from "@gsa/shared";

describe("computeBaselineKm", () => {
  it("returns the one-way km when not a round trip", () => {
    expect(computeBaselineKm(50, false)).toBe(50);
  });
  it("doubles the one-way km for a round trip", () => {
    expect(computeBaselineKm(50, true)).toBe(100);
  });
});

describe("toleranceRange", () => {
  it("computes the upper bound as baseline * (1 + pct/100)", () => {
    expect(toleranceRange(100, 10)).toEqual({ baselineKm: 100, upperBoundKm: 110 });
  });
  it("treats 0% tolerance as upper bound == baseline", () => {
    expect(toleranceRange(80, 0)).toEqual({ baselineKm: 80, upperBoundKm: 80 });
  });
});

describe("evaluateEnteredKm", () => {
  it("accepts km below the baseline without justification", () => {
    const r = evaluateEnteredKm({ enteredKm: 90, baselineKm: 100, tolerancePercent: 10 });
    expect(r).toEqual({ ok: true, overUpperBound: false, requiresJustification: false, error: null });
  });
  it("accepts km exactly at the upper bound", () => {
    const r = evaluateEnteredKm({ enteredKm: 110, baselineKm: 100, tolerancePercent: 10 });
    expect(r.ok).toBe(true);
    expect(r.overUpperBound).toBe(false);
  });
  it("rejects km over the upper bound without a justification", () => {
    const r = evaluateEnteredKm({ enteredKm: 120, baselineKm: 100, tolerancePercent: 10 });
    expect(r.ok).toBe(false);
    expect(r.overUpperBound).toBe(true);
    expect(r.requiresJustification).toBe(true);
    expect(r.error).toMatch(/giustificazione/i);
  });
  it("accepts km over the upper bound with a non-empty justification and flags it", () => {
    const r = evaluateEnteredKm({
      enteredKm: 120,
      baselineKm: 100,
      tolerancePercent: 10,
      justification: "Deviazione per cantiere",
    });
    expect(r.ok).toBe(true);
    expect(r.overUpperBound).toBe(true);
    expect(r.requiresJustification).toBe(true);
    expect(r.error).toBeNull();
  });
  it("treats a whitespace-only justification as missing", () => {
    const r = evaluateEnteredKm({ enteredKm: 120, baselineKm: 100, tolerancePercent: 10, justification: "   " });
    expect(r.ok).toBe(false);
  });
});

describe("mileageAmountCents", () => {
  it("multiplies km by the rate and rounds to integer cents", () => {
    // 123 * 0.6543 = 80.4789 EUR -> 8048 cents
    expect(mileageAmountCents(123, "0.6543")).toBe(8048);
  });
  it("rounds half to nearest cent", () => {
    // 10 * 0.1255 = 1.255 EUR -> 125.5 cents -> 126
    expect(mileageAmountCents(10, "0.1255")).toBe(126);
  });
});
