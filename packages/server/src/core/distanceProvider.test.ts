import { describe, it, expect } from "vitest";
import {
  ManualDistanceProvider,
  FakeDistanceProvider,
  type DistanceQuery,
} from "./distanceProvider.js";

const base: DistanceQuery = { origin: "Milano", destination: "Torino" };

describe("ManualDistanceProvider", () => {
  const provider = new ManualDistanceProvider();

  it("returns the employee-typed one-way manualKm", async () => {
    await expect(provider.getDistanceKm({ ...base, manualKm: 137 })).resolves.toBe(137);
  });

  it("throws when manualKm is missing", async () => {
    await expect(provider.getDistanceKm(base)).rejects.toThrow();
  });

  it("throws when manualKm is not positive", async () => {
    await expect(provider.getDistanceKm({ ...base, manualKm: 0 })).rejects.toThrow();
    await expect(provider.getDistanceKm({ ...base, manualKm: -5 })).rejects.toThrow();
  });
});

describe("FakeDistanceProvider", () => {
  it("returns its configured fixed distance regardless of query", async () => {
    const provider = new FakeDistanceProvider(42);
    await expect(provider.getDistanceKm(base)).resolves.toBe(42);
  });
});
