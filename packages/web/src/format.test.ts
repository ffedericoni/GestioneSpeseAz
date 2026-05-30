import { describe, it, expect } from "vitest";
import { formatEuroFromCents, formatDateIt } from "./format.js";

describe("it-IT formatters", () => {
  it("formats cents as euro with comma decimals and € symbol", () => {
    const out = formatEuroFromCents(123456);
    expect(out).toContain("1.234,56");
    expect(out).toContain("€");
  });

  it("formats zero cents", () => {
    expect(formatEuroFromCents(0)).toContain("0,00");
  });

  it("formats an ISO date as gg/MM/aaaa", () => {
    expect(formatDateIt("2026-05-30T10:00:00.000Z")).toBe("30/05/2026");
  });
});
