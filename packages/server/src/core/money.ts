// Money is always integer cents. This guards the invariant at the boundary
// where item amounts are summed into a report total.
export function sumCents(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`invalid cents value: ${v} (must be a non-negative integer)`);
    }
    total += v;
  }
  return total;
}
