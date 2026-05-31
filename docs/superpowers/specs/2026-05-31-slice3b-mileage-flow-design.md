# Slice 3b — Mileage Item Flow (Pure Core, Provider Port, Quote, Item Create & UI)

**Date:** 2026-05-31
**Status:** Approved design, pre-implementation
**Parent design:** `docs/superpowers/specs/2026-05-30-expense-management-design.md` (§6 Categories, §7 Mileage Validation, §8 ACI Rates, §13 Data Model, §14 API Surface)
**Builds on:** `docs/superpowers/specs/2026-05-31-slice3a-aci-vehicles-settings-design.md` (AciRate / Vehicle / Setting data foundation)

## 1. Purpose

Make the `MILEAGE` expense category usable end to end. Slice 3a built the data
foundation (ACI rate tables, vehicles linked to a rate, the admin-configurable
mileage tolerance). Slice 3b adds: the pure mileage calculation core, the
`DistanceProvider` port with a manual implementation, a quote (pre-flight
calculator) endpoint, acceptance of `MILEAGE` on item create/update with full
snapshotting, and the Italian mileage entry UI inside the report detail page.

Until this slice, item-create rejects `MILEAGE` with `DATI_NON_VALIDI`
(money categories only). After this slice, `MILEAGE` items compute their amount
server-side from `enteredKm × ratePerKm` and flow through the existing report
total and state machine unchanged.

## 2. Scope

**In Slice 3b:**

- Pure mileage core in `@gsa/shared` (`mileage.ts`): round-trip baseline,
  tolerance range, entered-km evaluation + justification gate, amount in cents.
- `DistanceProvider` port + `ManualDistanceProvider` + `FakeDistanceProvider`
  in the server's `core/`.
- Prisma migration adding the §7/§13 mileage columns to `ExpenseItem`
  (all nullable) and a `Vehicle.items` back-relation.
- `POST /api/items/mileage/quote` — pre-flight calculator, no DB write.
- Item create/update accepts `MILEAGE`, re-computes server-side, snapshots.
- Mileage entry sub-form in `ReportDetailPage.tsx`; new Italian strings.

**Out of scope (deferred, unchanged from parent §17):**

- Real geo-routing / geocoding providers (the port exists so one drops in later).
- Waypoint / multi-stop trips.
- OCR / receipt parsing, multi-tenancy, SSO, direct payment integration.

## 3. Routing decision (settled)

The only provider shipped now is **`ManualDistanceProvider`**: the employee
types the baseline (one-way) km, the provider returns it, and the **pure core**
doubles it for round trips and applies the tolerance machinery. This keeps the
full §7 behaviour (baseline → tolerance range → actual km → justification when
over) live and unit-tested today. The tolerance gate is "soft" in manual mode
(the baseline is self-reported), but the data shape, snapshotting, and core are
exactly what a real router needs — swapping in a geo provider later is a
backend-only change with no UI or core change.

## 4. Pure mileage core — `packages/shared/src/mileage.ts`

Framework- and I/O-free; exported from `packages/shared/src/index.ts`. All
public functions get a failing unit test first (TDD). Money is integer cents;
the rate is the ACI `costPerKm` decimal carried as a string (as in `aci.ts`).

```typescript
// One-way km -> baseline km used for the allowed range. Round trips double.
export function computeBaselineKm(oneWayKm: number, roundTrip: boolean): number {
  return roundTrip ? oneWayKm * 2 : oneWayKm;
}

export interface ToleranceRange {
  baselineKm: number;
  upperBoundKm: number;
}

// Allowed range is baseline -> baseline * (1 + pct/100). Below baseline is fine
// (it only saves money); only the upper bound is enforced.
export function toleranceRange(baselineKm: number, tolerancePercent: number): ToleranceRange {
  return {
    baselineKm,
    upperBoundKm: baselineKm * (1 + tolerancePercent / 100),
  };
}

export interface EnteredKmEvaluation {
  ok: boolean;
  overUpperBound: boolean;
  requiresJustification: boolean;
  // Italian error when not ok (over bound and no justification); else null.
  error: string | null;
}

// Validate the actual km driven against the allowed range. Over the upper bound
// is accepted ONLY with a non-empty justification; the caller flags such items
// for the manager.
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
// string (e.g. "0.6543"); kept as string to avoid float drift on the source.
export function mileageAmountCents(enteredKm: number, ratePerKm: string): number {
  return Math.round(enteredKm * Number(ratePerKm) * 100);
}
```

Notes:
- `enteredKm` and `oneWayKm` are whole kilometres, validated as positive integers
  by the API schema (Zod) before reaching the core; the core assumes sane numeric
  input and focuses on the domain rules. `upperBoundKm` (baseline × (1 + pct/100))
  may be fractional — it is a comparison bound only and is never stored.
- `requiresJustification` is `true` whenever the entry is over the upper bound,
  so the API/UI can flag the item even on the accepted (`ok: true`) path.

## 5. DistanceProvider port — `packages/server/src/core/distanceProvider.ts`

```typescript
export interface DistanceQuery {
  origin: string;
  destination: string;
  // Manual mode: the employee-typed one-way km. A real geo provider ignores it
  // and computes from origin/destination instead.
  manualKm?: number;
}

export interface DistanceProvider {
  // Returns the ONE-WAY practical distance in km. Round-trip doubling is applied
  // by the pure core, not here.
  getDistanceKm(query: DistanceQuery): Promise<number>;
}

export class ManualDistanceProvider implements DistanceProvider {
  async getDistanceKm(query: DistanceQuery): Promise<number> {
    if (query.manualKm == null || !Number.isFinite(query.manualKm) || query.manualKm <= 0) {
      throw new Error("manualKm richiesto e positivo per la modalità manuale.");
    }
    return query.manualKm;
  }
}
```

A `FakeDistanceProvider` (returns a fixed/configurable km, never touches the
network) is used in all automated tests. `routeProvider` is recorded on the item
as the string `"MANUAL"` for the manual provider.

## 6. Data model — one Prisma migration

Adds the §7/§13 mileage columns to `ExpenseItem`. All are nullable so existing
money items are unaffected; `roundTrip` defaults to `false`. No existing column
changes.

```prisma
model ExpenseItem {
  // ... existing fields unchanged ...
  // Mileage-only (snapshotted at entry; null for money categories):
  vehicleId            String?
  vehicle              Vehicle? @relation(fields: [vehicleId], references: [id])
  originAddress        String?
  destinationAddress   String?
  roundTrip            Boolean  @default(false)
  baselineKm           Int?
  tolerancePercent     Int?
  enteredKm            Int?
  ratePerKm            Decimal? @db.Decimal(8, 4)
  overageJustification String?
  routeProvider        String?
}

model Vehicle {
  // ... existing fields unchanged ...
  items ExpenseItem[]
}
```

`baselineKm` / `enteredKm` are `Int` (whole kilometres — no sub-km precision
needed). `tolerancePercent` is `Int`. `ratePerKm` mirrors `AciRate.costPerKm`
precision (`Decimal(8,4)`). The computed money lands in the existing
`amountCents Int`.

## 7. API surface (under `/api`, role-guarded)

Reuses existing Italian error codes (`NON_AUTENTICATO`, `NON_AUTORIZZATO`,
`DATI_NON_VALIDI`, `NOTA_SPESE_NON_TROVATA`, `NOTA_SPESE_NON_MODIFICABILE`,
`VOCE_NON_TROVATA`) and 3a's `VEICOLO_NON_TROVATO`.

### 7.1 `POST /api/items/mileage/quote` — authenticated, no DB write

Pre-flight calculator the UI calls before saving. New route module
`packages/server/src/items/mileage.routes.ts`, mounted under `/api/items`.

- Body: `{ vehicleId, originAddress, destinationAddress, roundTrip, manualKm }`.
- Resolves the vehicle **owner-scoped** to the current user (not found / not
  owned → `404 VEICOLO_NON_TROVATO`) and includes its `aciRate`.
- Reads the current tolerance `Setting` via `parseTolerancePercent`.
- Runs `ManualDistanceProvider.getDistanceKm` → one-way km →
  `computeBaselineKm(…, roundTrip)` → `toleranceRange(…)`.
- Returns `200 { baselineKm, upperBoundKm, tolerancePercent, ratePerKm }`
  (`ratePerKm` is the rate's `costPerKm` string).
- Invalid body (missing/positive checks) → `400 DATI_NON_VALIDI`.

### 7.2 Item create/update accepts `MILEAGE`

`createItemSchema` becomes a Zod **discriminated union on `category`**:

- Money categories (`MEALS_LODGING`, `TRANSPORT`, `OTHER`): unchanged shape
  (`category, date, description, amountCents, vatCents?, receiptRef?, notes?`).
- `MILEAGE`: `{ category: "MILEAGE", date, description, vehicleId,
  originAddress, destinationAddress, roundTrip (bool), manualKm (positive int),
  enteredKm (positive int), overageJustification?, notes? }`. **No client
  `amountCents`** — the server computes it.

Server handling for a `MILEAGE` create (in `items.routes.ts`, after the existing
`requireEditableOwnReport` guard):

1. Resolve the vehicle owner-scoped to the current user + its `aciRate`
   (→ `400 DATI_NON_VALIDI` if the vehicle is missing/not owned — the body is
   invalid for this user).
2. Read tolerance `Setting` → `parseTolerancePercent`.
3. `oneWayKm = await ManualDistanceProvider.getDistanceKm({ origin, destination, manualKm })`;
   `baselineKm = computeBaselineKm(oneWayKm, roundTrip)`.
4. `evaluateEnteredKm({ enteredKm, baselineKm, tolerancePercent, justification })`.
   If `!ok` → `400 DATI_NON_VALIDI` (over bound, no justification).
5. `amountCents = mileageAmountCents(enteredKm, rate.costPerKm)`.
6. Create the item snapshotting: `category="MILEAGE"`, `amountCents`,
   `vehicleId`, `originAddress`, `destinationAddress`, `roundTrip`, `baselineKm`,
   `tolerancePercent`, `enteredKm`, `ratePerKm=rate.costPerKm`,
   `overageJustification` (when over bound), `routeProvider="MANUAL"`,
   plus `date`, `description`, `notes`.
7. `recomputeTotal(reportId)` (existing) rolls it into the report total.

`PATCH` on a `MILEAGE` item re-runs the same resolve/compute/snapshot path with
the merged values. Editing/ownership/state guards are unchanged.

The server **never trusts client-supplied `amountCents` or `baselineKm`** for
mileage; it always recomputes from the vehicle's rate and the current tolerance.

## 8. Snapshotting & auditability (§7)

All rate/tolerance/route inputs are frozen onto the item at write time. A later
ACI re-import (which 3a preserves `AciRate.id` across) or a tolerance change
never retroactively alters a saved item's `amountCents`, `ratePerKm`, or
`tolerancePercent`. `routeProvider="MANUAL"` records how the baseline was
obtained, so a future switch to a real router is distinguishable in history.

## 9. Frontend (Italian) — `packages/web/src/pages/ReportDetailPage.tsx`

The add-item category `<select>` gains **Rimborso chilometrico** (the existing
`categories.MILEAGE` label). Selecting it swaps the money fields
(`amount`) for a mileage sub-form; money categories keep today's form.

Mileage sub-form fields and flow:

- **Veicolo** — `<select>` populated from `GET /api/vehicles` (active vehicles
  only), value = `vehicleId`.
- **Indirizzo di partenza** / **Indirizzo di arrivo** — text inputs.
- **Andata e ritorno** — checkbox (`roundTrip`).
- **Distanza stimata (km)** — number input (`manualKm`, the one-way baseline).
- **Calcola** button → `POST /api/items/mileage/quote`; on success shows the
  allowed range (`baselineKm` … `upperBoundKm` km) and `ratePerKm` €/km.
- **Km percorsi** — number input (`enteredKm`), enabled after a quote.
- **Giustificazione** — textarea, shown and **required** only when
  `enteredKm > upperBoundKm` (mirrors the server gate).
- **Aggiungi voce** posts the `MILEAGE` payload (no `amountCents`).

The items table is unchanged: it already shows the Italian category label and
the computed amount via the existing columns.

Web API client (`packages/web/src/api/client.ts`) gains a `MileageQuote` type
(`{ baselineKm; upperBoundKm; tolerancePercent; ratePerKm }`), the mileage
fields on the item type as needed, and a `quoteMileage(payload)` call.
New i18n keys under `items.mileage.*` (vehicle, origin, destination, roundTrip,
estimatedKm, calculate, enteredKm, justification, range, ratePerKm, plus error
messages such as `items.mileage.quoteError`).

## 10. Testing strategy (TDD)

Write the failing test first, watch it fail, then minimum code to pass.

- **Unit (Vitest, `@gsa/shared`):** `computeBaselineKm` (one-way vs round-trip);
  `toleranceRange` (upper bound math, e.g. 100 km @ 10% → 110); `evaluateEnteredKm`
  at/below baseline (ok, no justification), exactly at upper bound (ok), just
  over without justification (`!ok`), over with justification (`ok`,
  `requiresJustification` true); `mileageAmountCents` rounding (e.g.
  `123 km × "0.6543" → 8048` cents).
- **Core (Vitest, server):** `ManualDistanceProvider` returns `manualKm` and
  throws on missing/non-positive; `FakeDistanceProvider` returns its configured
  value.
- **API (Vitest + Supertest, real test DB):**
  - Quote: happy path returns range + rate; cross-user vehicle → `404`;
    unauthenticated → `401`.
  - Mileage create: computes & snapshots correct `amountCents`; over bound
    without justification → `400`; over bound with justification → `201` and
    `overageJustification` stored; server ignores any client-sent `amountCents`;
    a money item with mileage fields and vice-versa → `400` (discriminated
    union); non-owned report → `403`/`404` as today.
  - Snapshot durability: create a mileage item, then change the tolerance
    `Setting` (and/or re-import the rate) — the saved item's `amountCents`,
    `ratePerKm`, `tolerancePercent` are unchanged.
- **E2E (Playwright):** employee opens a report, adds a mileage item using a
  vehicle seeded from 3a's flow (search a rate, register a vehicle, then add the
  mileage item), clicks **Calcola**, enters km within range, saves, and sees the
  computed amount reflected in the report total. Thin.

## 11. Files touched (summary)

**Create:**
- `packages/shared/src/mileage.ts` (+ test in server core).
- `packages/server/src/core/distanceProvider.ts` (+ test).
- `packages/server/src/items/mileage.routes.ts` (quote endpoint).
- A Prisma migration for the `ExpenseItem` mileage columns.

**Modify:**
- `packages/shared/src/index.ts` — export `mileage.ts`.
- `packages/server/prisma/schema.prisma` — mileage columns + `Vehicle.items`.
- `packages/server/src/items/items.schemas.ts` — discriminated union incl. `MILEAGE`.
- `packages/server/src/items/items.routes.ts` — mileage create/update path.
- `packages/server/src/app.ts` — mount `mileage.routes.ts` under `/api/items`.
- `packages/web/src/api/client.ts` — `MileageQuote` type + `quoteMileage`.
- `packages/web/src/i18n.ts` — `items.mileage.*` strings.
- `packages/web/src/pages/ReportDetailPage.tsx` — mileage sub-form.
- `packages/web/e2e/*` — mileage E2E spec.
- `README.md` — move mileage from "not yet implemented" to a Slice 3b section.
```

