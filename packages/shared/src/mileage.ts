// Pure mileage domain: framework- and I/O-free. Money is integer cents; km are
// whole integers; the ACI rate is carried as the validated decimal string.

// One-way km -> baseline km used for the allowed range. Round trips double.
export function computeBaselineKm(oneWayKm: number, roundTrip: boolean): number {
  return roundTrip ? oneWayKm * 2 : oneWayKm;
}

export interface ToleranceRange {
  baselineKm: number;
  upperBoundKm: number;
}

// Allowed range is baseline -> baseline * (1 + pct/100). Below baseline is fine
// (it only saves money); only the upper bound is enforced. Round to 2 decimal
// places to avoid floating-point artefacts (e.g. 110.00000000000001).
export function toleranceRange(baselineKm: number, tolerancePercent: number): ToleranceRange {
  const raw = baselineKm * (1 + tolerancePercent / 100);
  return { baselineKm, upperBoundKm: Math.round(raw * 100) / 100 };
}

export interface EnteredKmEvaluation {
  ok: boolean;
  overUpperBound: boolean;
  requiresJustification: boolean;
  // Italian error when not ok (over bound and no justification); else null.
  error: string | null;
}

// Validate actual km driven against the allowed range. Over the upper bound is
// accepted ONLY with a non-empty justification; the caller flags such items so
// the manager sees them.
export function evaluateEnteredKm(input: {
  enteredKm: number;
  baselineKm: number;
  tolerancePercent: number;
  justification?: string | null;
}): EnteredKmEvaluation {
  const { upperBoundKm } = toleranceRange(input.baselineKm, input.tolerancePercent);
  const overUpperBound = input.enteredKm > upperBoundKm;
  const hasJustification = !!input.justification && input.justification.trim() !== "";
  if (overUpperBound && !hasJustification) {
    return {
      ok: false,
      overUpperBound,
      requiresJustification: true,
      error: "I km inseriti superano il limite consentito: inserire una giustificazione.",
    };
  }
  return { ok: true, overUpperBound, requiresJustification: overUpperBound, error: null };
}

// enteredKm * ratePerKm, rounded to integer cents. ratePerKm is the ACI decimal
// string (e.g. "0.6543"); kept as a string to avoid float drift. We use integer
// arithmetic on the rate digits to prevent IEEE-754 rounding errors
// (e.g. 10 * 0.1255 * 100 = 125.499... not 125.5).
export function mileageAmountCents(enteredKm: number, ratePerKm: string): number {
  const decimals = ratePerKm.includes(".") ? ratePerKm.split(".")[1].length : 0;
  const rateInt = parseInt(ratePerKm.replace(".", ""), 10);
  const divisor = Math.pow(10, decimals);
  return Math.round((enteredKm * rateInt * 100) / divisor);
}
