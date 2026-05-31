import { describe, it, expect } from "vitest";
import { sumCents } from "./money.js";

describe("sumCents", () => {
  it("sums an empty list to zero", () => {
    expect(sumCents([])).toBe(0);
  });

  it("sums integer cents", () => {
    expect(sumCents([1050, 2999, 1])).toBe(4050);
  });

  it("throws on a non-integer value (cents must be integers)", () => {
    expect(() => sumCents([100, 12.5])).toThrow();
  });

  it("throws on a negative value", () => {
    expect(() => sumCents([100, -1])).toThrow();
  });
});
