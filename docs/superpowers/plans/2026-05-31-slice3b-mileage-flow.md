# Slice 3b — Mileage Item Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `MILEAGE` expense category usable end to end — pure mileage core, a manual distance provider, a quote endpoint, `MILEAGE` accepted on item create with full snapshotting, and an Italian mileage entry sub-form.

**Architecture:** A pure, I/O-free mileage core in `@gsa/shared` (baseline doubling, tolerance range, entered-km evaluation, amount in cents) is consumed by thin Fastify handlers. Routing is behind a `DistanceProvider` port whose only shipped implementation is `ManualDistanceProvider` (employee types one-way km); the core does the round-trip doubling and tolerance math. The server always recomputes the amount from the vehicle's ACI rate + current tolerance and snapshots every input onto the item. The React report-detail page gains a mileage sub-form that calls a quote endpoint before saving.

**Tech Stack:** TypeScript monorepo (npm workspaces). `@gsa/shared` (pure domain). Server: Fastify 4 + Prisma 5 + PostgreSQL, Vitest + Supertest. Web: React 18 + Vite 5 + react-i18next, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-31-slice3b-mileage-flow-design.md`

---

## Critical conventions (read before starting)

- **After editing `@gsa/shared` sources you MUST rebuild it** before the server or web sees new exports: `npm run build --workspace packages/shared`. The `dist/` is gitignored.
- **Shared (pure) unit tests live in the server package** under `packages/server/src/core/*.test.ts` and import from `@gsa/shared` (see `packages/server/src/core/aci.test.ts`). The shared package itself ships no test runner.
- **Money is integer cents; km are integers; the ACI rate is a decimal string** (`AciRate.costPerKm`, e.g. `"0.6543"`). Never coerce the rate through a JS number except inside `mileageAmountCents`.
- **Italian error codes** already in use: `NON_AUTENTICATO` (401, via `requireAuth`), `NON_AUTORIZZATO` (403), `DATI_NON_VALIDI` (400), `NOTA_SPESE_NON_TROVATA` (404), `NOTA_SPESE_NON_MODIFICABILE` (409), `VOCE_NON_TROVATA` (404), `VEICOLO_NON_TROVATO` (404). Reuse them; do not invent new ones.
- **Web UI strings go through react-i18next `t(...)`** (Italian) in `packages/web/src/i18n.ts`. No English reaches the user. Web pages have **no unit tests** by project convention — they are verified by `tsc -b && vite build` and Playwright.
- **`packages/server/.env` and root `.env` are gitignored and must NEVER be committed.** Before every commit run `git status` and confirm no `.env` is staged.
- **Branch:** all work happens on `slice-3b-mileage-flow` (created in Task 1). Do not commit Slice 3b work to `master`.
- Server tests need the migrated test DB (`TEST_DATABASE_URL` → `gestione_spese_test`). The harness (`packages/server/test/helpers.ts`) points Prisma at it.

---

## File Structure

**Create:**
- `packages/shared/src/mileage.ts` — pure mileage core (baseline, tolerance range, entered-km evaluation, amount cents).
- `packages/server/src/core/mileage.test.ts` — unit tests for the shared mileage core.
- `packages/server/src/core/distanceProvider.ts` — `DistanceProvider` port + `ManualDistanceProvider` + `FakeDistanceProvider`.
- `packages/server/src/core/distanceProvider.test.ts` — provider unit tests.
- `packages/server/src/items/mileage.routes.ts` — `POST /api/items/mileage/quote`.
- `packages/server/test/mileage.api.test.ts` — quote + mileage-create API tests.
- A Prisma migration directory under `packages/server/prisma/migrations/` (generated).
- `packages/web/e2e/mileage.spec.ts` — mileage happy-path E2E.

**Modify:**
- `packages/shared/src/index.ts` — export `./mileage.js`.
- `packages/server/prisma/schema.prisma` — mileage columns on `ExpenseItem`; `Vehicle.items` back-relation.
- `packages/server/test/helpers.ts` — add `seedVehicle` helper.
- `packages/server/src/items/items.schemas.ts` — `createItemSchema` discriminated union incl. `MILEAGE`.
- `packages/server/src/items/items.routes.ts` — mileage create path.
- `packages/server/src/app.ts` — mount `mileage.routes.ts` under `/api/items`.
- `packages/web/src/api/client.ts` — `MileageQuote` type, mileage item fields, `quoteMileage`/mileage-create helpers.
- `packages/web/src/i18n.ts` — `items.mileage.*` strings.
- `packages/web/src/pages/ReportDetailPage.tsx` — mileage sub-form.
- `README.md` — move mileage to an implemented Slice 3b section.

---

## Task 1: Branch + pure mileage core in `@gsa/shared` (TDD)

**Files:**
- Create: `packages/shared/src/mileage.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/server/src/core/mileage.test.ts`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout master
git checkout -b slice-3b-mileage-flow
```

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/core/mileage.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run build --workspace packages/shared && npm test --workspace packages/server -- mileage.test`
Expected: FAIL — the `@gsa/shared` exports `computeBaselineKm` etc. do not exist yet (import/type errors or `is not a function`).

- [ ] **Step 4: Implement the pure core**

Create `packages/shared/src/mileage.ts`:

```typescript
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
// (it only saves money); only the upper bound is enforced.
export function toleranceRange(baselineKm: number, tolerancePercent: number): ToleranceRange {
  return { baselineKm, upperBoundKm: baselineKm * (1 + tolerancePercent / 100) };
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
// string (e.g. "0.6543"); kept as a string to avoid float drift on the source.
export function mileageAmountCents(enteredKm: number, ratePerKm: string): number {
  return Math.round(enteredKm * Number(ratePerKm) * 100);
}
```

- [ ] **Step 5: Export from the shared barrel**

Modify `packages/shared/src/index.ts` to add the new export (keep existing lines):

```typescript
export * from "./roles.js";
export * from "./reports.js";
export * from "./aci.js";
export * from "./mileage.js";
```

- [ ] **Step 6: Rebuild shared and run the test to verify it passes**

Run: `npm run build --workspace packages/shared && npm test --workspace packages/server -- mileage.test`
Expected: PASS (all `mileage.test.ts` cases green).

- [ ] **Step 7: Commit**

```bash
git status   # confirm no .env staged
git add packages/shared/src/mileage.ts packages/shared/src/index.ts packages/server/src/core/mileage.test.ts
git commit -m "feat(shared): pure mileage core (baseline, tolerance, amount cents)"
```

---

## Task 2: DistanceProvider port + manual & fake providers (TDD)

**Files:**
- Create: `packages/server/src/core/distanceProvider.ts`
- Test: `packages/server/src/core/distanceProvider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/core/distanceProvider.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- distanceProvider.test`
Expected: FAIL — `./distanceProvider.js` does not exist.

- [ ] **Step 3: Implement the port and providers**

Create `packages/server/src/core/distanceProvider.ts`:

```typescript
// Routing port. The only shipped implementation is manual; a real geo provider
// can drop in later without touching callers. Round-trip doubling lives in the
// pure mileage core, not here — providers return the ONE-WAY distance.

export interface DistanceQuery {
  origin: string;
  destination: string;
  // Manual mode: the employee-typed one-way km. A real geo provider ignores it
  // and computes from origin/destination instead.
  manualKm?: number;
}

export interface DistanceProvider {
  // Returns the one-way practical distance in km.
  getDistanceKm(query: DistanceQuery): Promise<number>;
}

export class ManualDistanceProvider implements DistanceProvider {
  async getDistanceKm(query: DistanceQuery): Promise<number> {
    const km = query.manualKm;
    if (km == null || !Number.isFinite(km) || km <= 0) {
      throw new Error("manualKm richiesto e positivo per la modalità manuale.");
    }
    return km;
  }
}

// Test-only: never touches the network. Returns a fixed configured distance.
export class FakeDistanceProvider implements DistanceProvider {
  constructor(private readonly km: number) {}
  async getDistanceKm(_query: DistanceQuery): Promise<number> {
    return this.km;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace packages/server -- distanceProvider.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git status   # confirm no .env staged
git add packages/server/src/core/distanceProvider.ts packages/server/src/core/distanceProvider.test.ts
git commit -m "feat(server): DistanceProvider port + manual & fake providers"
```

---

## Task 3: Prisma migration for mileage columns + test seed helper

**Files:**
- Modify: `packages/server/prisma/schema.prisma`
- Modify: `packages/server/test/helpers.ts`

- [ ] **Step 1: Add mileage columns to `ExpenseItem` and the `Vehicle.items` back-relation**

In `packages/server/prisma/schema.prisma`, replace the `ExpenseItem` model body's trailing comment + index with the mileage columns. The model currently ends:

```prisma
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  // Mileage-only columns (vehicleId, baselineKm, enteredKm, ratePerKm, ...) are
  // added in Slice 3 when the MILEAGE category becomes supported.
  @@index([reportId])
}
```

Change it to:

```prisma
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
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
  @@index([reportId])
  @@index([vehicleId])
}
```

Add the back-relation to the `Vehicle` model (it currently ends with `@@index([userId])`):

```prisma
model Vehicle {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  label     String
  aciRateId String
  aciRate   AciRate  @relation(fields: [aciRateId], references: [id])
  plate     String?
  active    Boolean  @default(true)
  items     ExpenseItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}
```

- [ ] **Step 2: Generate the migration against the dev DB**

Run: `npm run prisma:migrate --workspace packages/server -- --name mileage_item_columns`
Expected: Prisma creates `packages/server/prisma/migrations/<timestamp>_mileage_item_columns/migration.sql`, applies it to the dev DB (`gestione_spese`), and regenerates the client. The SQL should `ALTER TABLE "ExpenseItem" ADD COLUMN ...` for the new fields (all nullable, `roundTrip` default false) — no data loss.

- [ ] **Step 3: Apply the migration to the test DB**

Run: `cross-env DATABASE_URL=$TEST_DATABASE_URL npm exec --workspace packages/server -- prisma migrate deploy`

If `cross-env`/shell var expansion is awkward on Windows PowerShell, instead run from `packages/server` with the test URL inline:
`$env:DATABASE_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy; Remove-Item Env:DATABASE_URL`
Expected: "All migrations have been applied" against `gestione_spese_test`.

- [ ] **Step 4: Add a `seedVehicle` helper for tests**

In `packages/server/test/helpers.ts`, add after `seedAciRate` (end of file):

```typescript
// Seeds a vehicle owned by `userId`, linked to `aciRateId`.
export async function seedVehicle(opts: {
  userId: string;
  aciRateId: string;
  label?: string;
  active?: boolean;
}): Promise<{ id: string }> {
  const vehicle = await prisma.vehicle.create({
    data: {
      userId: opts.userId,
      aciRateId: opts.aciRateId,
      label: opts.label ?? "Auto personale",
      active: opts.active ?? true,
    },
  });
  return { id: vehicle.id };
}
```

- [ ] **Step 5: Verify the schema compiles and the existing suite still passes**

Run: `npm run build --workspace packages/server && npm test --workspace packages/server`
Expected: build clean; all existing tests (64) still pass against the migrated test DB.

- [ ] **Step 6: Commit**

```bash
git status   # confirm no .env staged; the migration.sql IS tracked and should be staged
git add packages/server/prisma/schema.prisma packages/server/prisma/migrations packages/server/test/helpers.ts
git commit -m "feat(server): add mileage columns to ExpenseItem + seedVehicle helper"
```

---

## Task 4: Mileage quote endpoint (TDD)

**Files:**
- Create: `packages/server/src/items/mileage.routes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/mileage.api.test.ts`

- [ ] **Step 1: Write the failing test (quote cases)**

Create `packages/server/test/mileage.api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, seedAciRate, seedVehicle, seedReport, prisma } from "./helpers.js";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb();
});

async function loginAs(email: string, password: string) {
  const agent = request.agent(app.server);
  await agent.post("/api/login").send({ email, password });
  return agent;
}

describe("mileage quote", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).post("/api/items/mileage/quote").send({});
    expect(res.status).toBe(401);
  });

  it("returns baseline, upper bound, tolerance and rate for an owned vehicle", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id, costPerKm: "0.6543" });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });

    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
    });
    expect(res.status).toBe(200);
    // default tolerance 10% -> upper bound 110
    expect(res.body).toEqual({
      baselineKm: 100,
      upperBoundKm: 110,
      tolerancePercent: 10,
      ratePerKm: "0.6543",
    });
  });

  it("doubles the baseline for a round trip", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });

    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: true,
      manualKm: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body.baselineKm).toBe(200);
    expect(res.body.upperBoundKm).toBe(220);
  });

  it("returns 404 VEICOLO_NON_TROVATO for another user's vehicle", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const owner = await seedUser({ email: "o@x.it", password: "password123", fullName: "O", role: "EMPLOYEE" });
    await seedUser({ email: "other@x.it", password: "password123", fullName: "Other", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });
    const veh = await seedVehicle({ userId: owner.id, aciRateId: rate.id });

    const agent = await loginAs("other@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEICOLO_NON_TROVATO");
  });

  it("rejects an invalid body with 400", async () => {
    await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({ vehicleId: "x", manualKm: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- mileage.api`
Expected: FAIL — the `/api/items/mileage/quote` route returns 404 (not mounted), so the 200/404/400 assertions fail.

- [ ] **Step 3: Implement the quote route module**

Create `packages/server/src/items/mileage.routes.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  MILEAGE_TOLERANCE_KEY,
  parseTolerancePercent,
  computeBaselineKm,
  toleranceRange,
} from "@gsa/shared";
import { ManualDistanceProvider } from "../core/distanceProvider.js";

const provider = new ManualDistanceProvider();

export const quoteSchema = z.object({
  vehicleId: z.string().min(1),
  originAddress: z.string().min(1),
  destinationAddress: z.string().min(1),
  roundTrip: z.boolean(),
  manualKm: z.number().int().positive(),
});

// Loads the current tolerance percent (default when unset).
async function currentTolerancePercent(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
  return parseTolerancePercent(setting?.value);
}

export async function mileageRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/items".
  app.post("/mileage/quote", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: parsed.data.vehicleId, userId: me.id },
      include: { aciRate: { select: { costPerKm: true } } },
    });
    if (!vehicle) return reply.code(404).send({ error: "VEICOLO_NON_TROVATO" });

    const tolerancePercent = await currentTolerancePercent();
    const oneWayKm = await provider.getDistanceKm({
      origin: parsed.data.originAddress,
      destination: parsed.data.destinationAddress,
      manualKm: parsed.data.manualKm,
    });
    const baselineKm = computeBaselineKm(oneWayKm, parsed.data.roundTrip);
    const { upperBoundKm } = toleranceRange(baselineKm, tolerancePercent);

    return {
      baselineKm,
      upperBoundKm,
      tolerancePercent,
      ratePerKm: vehicle.aciRate.costPerKm.toString(),
    };
  });
}
```

- [ ] **Step 4: Mount the route under `/api/items`**

In `packages/server/src/app.ts`, add the import near the other route imports:

```typescript
import { mileageRoutes } from "./items/mileage.routes.js";
```

and register it inside the `/api` plugin (add after the `itemRoutes` registration line):

```typescript
      await api.register(itemRoutes, { prefix: "/reports/:reportId/items" });
      await api.register(mileageRoutes, { prefix: "/items" });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --workspace packages/server -- mileage.api`
Expected: PASS (all quote cases green).

- [ ] **Step 6: Commit**

```bash
git status   # confirm no .env staged
git add packages/server/src/items/mileage.routes.ts packages/server/src/app.ts packages/server/test/mileage.api.test.ts
git commit -m "feat(server): mileage quote endpoint"
```

---

## Task 5: Accept MILEAGE on item create + snapshot (TDD)

**Files:**
- Modify: `packages/server/src/items/items.schemas.ts`
- Modify: `packages/server/src/items/items.routes.ts`
- Test: `packages/server/test/mileage.api.test.ts` (append a `describe`)

- [ ] **Step 1: Append failing tests for mileage item create**

Append this `describe` block to `packages/server/test/mileage.api.test.ts` (reuse the existing imports/helpers/`loginAs` at the top of the file — `seedReport` and `prisma` are already imported there):

```typescript
describe("mileage item create", () => {
  async function setup() {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id, costPerKm: "0.6543" });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });
    const report = await seedReport({ ownerId: emp.id, state: "CREATED" });
    const agent = await loginAs("e@x.it", "password123");
    return { emp, rate, veh, report, agent };
  }

  it("computes amountCents from the rate and snapshots the inputs", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Milano-Torino",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(res.status).toBe(201);
    // 100 * 0.6543 = 65.43 EUR -> 6543 cents
    expect(res.body.amountCents).toBe(6543);
    expect(res.body.category).toBe("MILEAGE");

    // Snapshot persisted on the row.
    const item = await prisma.expenseItem.findUnique({ where: { id: res.body.id } });
    expect(item?.baselineKm).toBe(100);
    expect(item?.enteredKm).toBe(100);
    expect(item?.tolerancePercent).toBe(10);
    expect(item?.ratePerKm?.toString()).toBe("0.6543");
    expect(item?.routeProvider).toBe("MANUAL");
    expect(item?.vehicleId).toBe(veh.id);
  });

  it("ignores any client-supplied amountCents and recomputes", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Tentativo",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
      amountCents: 999999,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(6543);
  });

  it("rejects km over the upper bound without a justification", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Troppi km",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 200, // upper bound is 110
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("accepts km over the upper bound with a justification and stores it", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Deviazione",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 200,
      overageJustification: "Strada chiusa, deviazione obbligata",
    });
    expect(res.status).toBe(201);
    // 200 * 0.6543 = 130.86 EUR -> 13086 cents
    expect(res.body.amountCents).toBe(13086);
    const item = await prisma.expenseItem.findUnique({ where: { id: res.body.id } });
    expect(item?.overageJustification).toBe("Strada chiusa, deviazione obbligata");
  });

  it("rejects a MILEAGE body that is missing required mileage fields with 400", async () => {
    const { report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Incompleto",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("rejects a MILEAGE body whose vehicle belongs to someone else with 400", async () => {
    const { report, agent } = await setup();
    const admin2 = await seedUser({ email: "a2@x.it", password: "password123", fullName: "A2", role: "ADMIN" });
    const other = await seedUser({ email: "o2@x.it", password: "password123", fullName: "O2", role: "EMPLOYEE" });
    const rate2 = await seedAciRate({ importedById: admin2.id, make: "Audi" });
    const otherVeh = await seedVehicle({ userId: other.id, aciRateId: rate2.id });
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Veicolo altrui",
      vehicleId: otherVeh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("keeps the snapshot stable when the tolerance setting later changes", async () => {
    const { veh, report, agent } = await setup();
    const created = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Snapshot",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(created.body.amountCents).toBe(6543);

    // Admin changes the tolerance afterwards.
    const adminAgent = await loginAs("a@x.it", "password123");
    await adminAgent.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 50 });

    const item = await prisma.expenseItem.findUnique({ where: { id: created.body.id } });
    expect(item?.tolerancePercent).toBe(10); // unchanged snapshot
    expect(item?.amountCents).toBe(6543);
  });

  it("still rejects MILEAGE money fields confusion (money item with mileage fields is fine; mileage requires its own)", async () => {
    const { report, agent } = await setup();
    // A money item is unaffected by the union and ignores stray fields it doesn't declare.
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "TRANSPORT",
      date: "2026-05-20",
      description: "Treno",
      amountCents: 2500,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(2500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- mileage.api`
Expected: FAIL — `MILEAGE` is currently rejected by `createItemSchema` (money-only), so the create calls return 400 instead of 201.

- [ ] **Step 3: Make `createItemSchema` a discriminated union (keep `updateItemSchema` money-only)**

Replace the whole body of `packages/server/src/items/items.schemas.ts` with:

```typescript
import { z } from "zod";
import { MONEY_CATEGORIES, type MoneyCategory } from "@gsa/shared";

// Money categories: direct amount in cents. Unchanged from earlier slices.
const moneyItemSchema = z.object({
  category: z.enum(MONEY_CATEGORIES as unknown as [MoneyCategory, ...MoneyCategory[]]),
  date: z.coerce.date(),
  description: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  vatCents: z.number().int().nonnegative().nullish(),
  receiptRef: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

// MILEAGE: the server computes amountCents from the vehicle's ACI rate; the
// client never sends amountCents. enteredKm/manualKm are whole positive km.
const mileageItemSchema = z.object({
  category: z.literal("MILEAGE"),
  date: z.coerce.date(),
  description: z.string().min(1),
  vehicleId: z.string().min(1),
  originAddress: z.string().min(1),
  destinationAddress: z.string().min(1),
  roundTrip: z.boolean(),
  manualKm: z.number().int().positive(),
  enteredKm: z.number().int().positive(),
  overageJustification: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

export const createItemSchema = z.discriminatedUnion("category", [
  moneyItemSchema,
  mileageItemSchema,
]);

// Editing is money-only for now (no UI edits items; mileage edit is deferred,
// see the Slice 3b spec §2). A PATCH carrying MILEAGE/mileage fields fails here.
export const updateItemSchema = moneyItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
```

- [ ] **Step 4: Branch the item-create handler for MILEAGE**

In `packages/server/src/items/items.routes.ts`, add imports at the top (after the existing imports):

```typescript
import {
  MILEAGE_TOLERANCE_KEY,
  parseTolerancePercent,
  computeBaselineKm,
  evaluateEnteredKm,
  mileageAmountCents,
} from "@gsa/shared";
import { ManualDistanceProvider } from "../core/distanceProvider.js";
```

Note: the file already imports `isEditableState` from `@gsa/shared`; **merge** the new named imports into a single import statement from `@gsa/shared` rather than duplicating the module specifier. Final shared import line:

```typescript
import {
  isEditableState,
  MILEAGE_TOLERANCE_KEY,
  parseTolerancePercent,
  computeBaselineKm,
  evaluateEnteredKm,
  mileageAmountCents,
} from "@gsa/shared";
```

Add a module-level provider instance (below the imports, above `itemSelect`):

```typescript
const distanceProvider = new ManualDistanceProvider();
```

Extend `itemSelect` so mileage fields are returned on create (replace the existing `itemSelect` literal):

```typescript
const itemSelect = {
  id: true,
  category: true,
  date: true,
  description: true,
  amountCents: true,
  vatCents: true,
  receiptRef: true,
  notes: true,
  vehicleId: true,
  originAddress: true,
  destinationAddress: true,
  roundTrip: true,
  baselineKm: true,
  tolerancePercent: true,
  enteredKm: true,
  ratePerKm: true,
  overageJustification: true,
  routeProvider: true,
} satisfies Prisma.ExpenseItemSelect;
```

Replace the POST handler body (currently it does a single `prisma.expenseItem.create` for the money case) so it branches on category:

```typescript
  app.post<{ Params: { reportId: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const data = parsed.data;

      if (data.category === "MILEAGE") {
        const me = req.currentUser!;
        // Vehicle must exist AND belong to the caller; an unknown/foreign vehicle
        // makes the body invalid for this user (400, not a bare 404).
        const vehicle = await prisma.vehicle.findFirst({
          where: { id: data.vehicleId, userId: me.id },
          include: { aciRate: { select: { costPerKm: true } } },
        });
        if (!vehicle) return reply.code(400).send({ error: "DATI_NON_VALIDI" });

        const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
        const tolerancePercent = parseTolerancePercent(setting?.value);

        const oneWayKm = await distanceProvider.getDistanceKm({
          origin: data.originAddress,
          destination: data.destinationAddress,
          manualKm: data.manualKm,
        });
        const baselineKm = computeBaselineKm(oneWayKm, data.roundTrip);

        const evaluation = evaluateEnteredKm({
          enteredKm: data.enteredKm,
          baselineKm,
          tolerancePercent,
          justification: data.overageJustification,
        });
        if (!evaluation.ok) return reply.code(400).send({ error: "DATI_NON_VALIDI" });

        const ratePerKm = vehicle.aciRate.costPerKm.toString();
        const amountCents = mileageAmountCents(data.enteredKm, ratePerKm);

        const item = await prisma.expenseItem.create({
          data: {
            reportId,
            category: "MILEAGE",
            date: data.date,
            description: data.description,
            amountCents,
            notes: data.notes ?? null,
            vehicleId: vehicle.id,
            originAddress: data.originAddress,
            destinationAddress: data.destinationAddress,
            roundTrip: data.roundTrip,
            baselineKm,
            tolerancePercent,
            enteredKm: data.enteredKm,
            ratePerKm,
            overageJustification: evaluation.overUpperBound ? (data.overageJustification ?? null) : null,
            routeProvider: "MANUAL",
          },
          select: itemSelect,
        });
        await recomputeTotal(reportId);
        return reply.code(201).send(item);
      }

      // Money categories: unchanged behaviour.
      const item = await prisma.expenseItem.create({
        data: { reportId, ...data },
        select: itemSelect,
      });
      await recomputeTotal(reportId);
      return reply.code(201).send(item);
    },
  );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run build --workspace packages/shared && npm test --workspace packages/server -- mileage.api`
Expected: PASS (all `mileage item create` cases green).

- [ ] **Step 6: Run the full server suite (no regressions)**

Run: `npm test --workspace packages/server`
Expected: all tests pass (existing 64 + new mileage core/provider/api tests).

- [ ] **Step 7: Commit**

```bash
git status   # confirm no .env staged
git add packages/server/src/items/items.schemas.ts packages/server/src/items/items.routes.ts packages/server/test/mileage.api.test.ts
git commit -m "feat(server): accept MILEAGE on item create with server-side compute + snapshot"
```

---

## Task 6: Web API client types + i18n strings

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add the `MileageQuote` type, mileage item fields, and `quoteMileage` helper**

In `packages/web/src/api/client.ts`, extend the `ReportItem` interface with the mileage snapshot fields (all nullable) — replace the existing `ReportItem` interface:

```typescript
export interface ReportItem {
  id: string;
  category: Category;
  date: string;
  description: string;
  amountCents: number;
  vatCents: number | null;
  notes: string | null;
  // Mileage snapshot (null for money categories):
  vehicleId: string | null;
  originAddress: string | null;
  destinationAddress: string | null;
  roundTrip: boolean | null;
  baselineKm: number | null;
  tolerancePercent: number | null;
  enteredKm: number | null;
  ratePerKm: string | null;
  overageJustification: string | null;
  routeProvider: string | null;
}
```

Add the quote types and payloads after the `ToleranceSetting` interface (end of file):

```typescript
export interface MileageQuoteInput {
  vehicleId: string;
  originAddress: string;
  destinationAddress: string;
  roundTrip: boolean;
  manualKm: number;
}

export interface MileageQuote {
  baselineKm: number;
  upperBoundKm: number;
  tolerancePercent: number;
  ratePerKm: string;
}

export interface NewMileageItemInput extends MileageQuoteInput {
  category: "MILEAGE";
  date: string;
  description: string;
  enteredKm: number;
  overageJustification?: string | null;
}

export function quoteMileage(input: MileageQuoteInput): Promise<MileageQuote> {
  return api.post<MileageQuote>("/items/mileage/quote", input);
}
```

- [ ] **Step 2: Add Italian mileage strings**

In `packages/web/src/i18n.ts`, add a `mileage` block inside the existing `items` object (after the `addError` key):

```typescript
    items: {
      heading: "Voci di spesa",
      add: "Aggiungi voce",
      category: "Categoria",
      date: "Data",
      description: "Descrizione",
      amount: "Importo (€)",
      vat: "IVA (€)",
      notes: "Note",
      remove: "Elimina",
      empty: "Nessuna voce inserita.",
      addError: "Impossibile aggiungere la voce.",
      mileage: {
        vehicle: "Veicolo",
        noVehicle: "Nessun veicolo disponibile",
        origin: "Indirizzo di partenza",
        destination: "Indirizzo di arrivo",
        roundTrip: "Andata e ritorno",
        estimatedKm: "Distanza stimata (km)",
        calculate: "Calcola",
        range: "Intervallo consentito",
        ratePerKm: "Tariffa (€/km)",
        enteredKm: "Km percorsi",
        justification: "Giustificazione",
        quoteError: "Impossibile calcolare il preventivo. Verifica i dati.",
        needVehicle: "Registra un veicolo nella pagina Veicoli per inserire un rimborso chilometrico.",
      },
    },
```

- [ ] **Step 3: Verify web type-check and build**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` and `vite build` succeed (no type errors from the new client types/strings).

- [ ] **Step 4: Commit**

```bash
git status   # confirm no .env staged
git add packages/web/src/api/client.ts packages/web/src/i18n.ts
git commit -m "feat(web): mileage client types, quoteMileage helper, Italian strings"
```

---

## Task 7: Mileage entry sub-form in the report detail page

**Files:**
- Modify: `packages/web/src/pages/ReportDetailPage.tsx`

- [ ] **Step 1: Replace `ReportDetailPage.tsx` with the mileage-aware version**

This adds `MILEAGE` to the category selector, loads the user's active vehicles, shows a mileage sub-form with a **Calcola** quote step, requires a justification only when entered km exceed the upper bound, and posts the mileage payload (no `amountCents`). Money categories keep today's form.

Replace the whole file `packages/web/src/pages/ReportDetailPage.tsx` with:

```typescript
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { actionsFor, MONEY_CATEGORIES, type MoneyCategory, type Category } from "@gsa/shared";
import {
  api,
  quoteMileage,
  type ReportDetail,
  type Vehicle,
  type MileageQuote,
} from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-item form state
  const [category, setCategory] = useState<Category>("TRANSPORT");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  // Mileage sub-form state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [estimatedKm, setEstimatedKm] = useState("");
  const [enteredKm, setEnteredKm] = useState("");
  const [justification, setJustification] = useState("");
  const [quote, setQuote] = useState<MileageQuote | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setReport(await api.get<ReportDetail>(`/reports/${id}`));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void api
      .get<Vehicle[]>("/vehicles")
      .then((vs) => setVehicles(vs.filter((v) => v.active)))
      .catch(() => setVehicles([]));
  }, []);

  if (!report) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage = available.some((a) => a === "approve" || a === "reject" || a === "revise");

  const overBound = quote != null && Number(enteredKm) > quote.upperBoundKm;

  function resetItemForm(): void {
    setDescription("");
    setAmount("");
    setDate("");
    setVehicleId("");
    setOrigin("");
    setDestination("");
    setRoundTrip(false);
    setEstimatedKm("");
    setEnteredKm("");
    setJustification("");
    setQuote(null);
  }

  async function onCalculate(): Promise<void> {
    setError(null);
    try {
      const q = await quoteMileage({
        vehicleId,
        originAddress: origin,
        destinationAddress: destination,
        roundTrip,
        manualKm: Math.round(Number(estimatedKm)),
      });
      setQuote(q);
    } catch {
      setError(t("items.mileage.quoteError"));
    }
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      if (category === "MILEAGE") {
        await api.post(`/reports/${report!.id}/items`, {
          category: "MILEAGE",
          date,
          description,
          vehicleId,
          originAddress: origin,
          destinationAddress: destination,
          roundTrip,
          manualKm: Math.round(Number(estimatedKm)),
          enteredKm: Math.round(Number(enteredKm)),
          overageJustification: overBound ? justification : undefined,
        });
      } else {
        await api.post(`/reports/${report!.id}/items`, {
          category,
          date,
          description,
          amountCents: Math.round(Number(amount) * 100),
        });
      }
      resetItemForm();
      await refresh();
    } catch {
      setError(t("items.addError"));
    }
  }

  async function removeItem(itemId: string): Promise<void> {
    await api.del(`/reports/${report!.id}/items/${itemId}`);
    await refresh();
  }

  async function act(action: "submit" | "approve" | "reject" | "revise"): Promise<void> {
    setError(null);
    try {
      if (action === "revise") {
        const comment = window.prompt(t("reports.revisePrompt")) ?? "";
        if (!comment) return;
        await api.post(`/reports/${report!.id}/revise`, { comment });
      } else {
        await api.post(`/reports/${report!.id}/${action}`);
      }
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  // MILEAGE plus the money categories.
  const allCategories: Category[] = ["MILEAGE", ...MONEY_CATEGORIES];

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <p><Link to="/note-spese">{t("reports.back")}</Link></p>
      <h1>{report.title}</h1>
      <p>
        {t("reports.state")}: <strong>{t(`states.${report.state}`)}</strong> ·{" "}
        {t("reports.total")}: <strong>{formatEuroFromCents(report.totalCents)}</strong>
      </p>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      <h2>{t("items.heading")}</h2>
      {report.items.length === 0 ? (
        <p>{t("items.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("items.date")}</th>
              <th style={{ textAlign: "left" }}>{t("items.category")}</th>
              <th style={{ textAlign: "left" }}>{t("items.description")}</th>
              <th style={{ textAlign: "right" }}>{t("items.amount")}</th>
              {isOwner && editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {report.items.map((it) => (
              <tr key={it.id}>
                <td>{formatDateIt(it.date)}</td>
                <td>{t(`categories.${it.category}`)}</td>
                <td>{it.description}</td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(it.amountCents)}</td>
                {isOwner && editable && (
                  <td>
                    <button onClick={() => void removeItem(it.id)}>{t("items.remove")}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOwner && editable && (
        <form onSubmit={addItem} style={{ display: "grid", gap: 8, maxWidth: 480, marginTop: 16 }}>
          <h3>{t("items.add")}</h3>
          <select
            aria-label={t("items.category")}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setQuote(null);
            }}
          >
            {allCategories.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
          <input
            type="date"
            aria-label={t("items.date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <input
            placeholder={t("items.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          {category === "MILEAGE" ? (
            vehicles.length === 0 ? (
              <p role="alert" style={{ color: "#dc2626" }}>{t("items.mileage.needVehicle")}</p>
            ) : (
              <>
                <select
                  aria-label={t("items.mileage.vehicle")}
                  value={vehicleId}
                  onChange={(e) => { setVehicleId(e.target.value); setQuote(null); }}
                  required
                >
                  <option value="">{t("items.mileage.noVehicle")}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {v.aciRate.make} {v.aciRate.model} ({v.aciRate.costPerKm} €/km)
                    </option>
                  ))}
                </select>
                <input
                  placeholder={t("items.mileage.origin")}
                  value={origin}
                  onChange={(e) => { setOrigin(e.target.value); setQuote(null); }}
                  required
                />
                <input
                  placeholder={t("items.mileage.destination")}
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setQuote(null); }}
                  required
                />
                <label>
                  <input
                    type="checkbox"
                    checked={roundTrip}
                    onChange={(e) => { setRoundTrip(e.target.checked); setQuote(null); }}
                  />{" "}
                  {t("items.mileage.roundTrip")}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("items.mileage.estimatedKm")}
                  aria-label={t("items.mileage.estimatedKm")}
                  value={estimatedKm}
                  onChange={(e) => { setEstimatedKm(e.target.value); setQuote(null); }}
                  required
                />
                <button type="button" onClick={() => void onCalculate()}>
                  {t("items.mileage.calculate")}
                </button>
                {quote && (
                  <p style={{ color: "#15803d" }}>
                    {t("items.mileage.range")}: {quote.baselineKm}–{quote.upperBoundKm} km ·{" "}
                    {t("items.mileage.ratePerKm")}: {quote.ratePerKm}
                  </p>
                )}
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("items.mileage.enteredKm")}
                  aria-label={t("items.mileage.enteredKm")}
                  value={enteredKm}
                  onChange={(e) => setEnteredKm(e.target.value)}
                  disabled={!quote}
                  required
                />
                {overBound && (
                  <textarea
                    placeholder={t("items.mileage.justification")}
                    aria-label={t("items.mileage.justification")}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    required
                  />
                )}
                <button type="submit" disabled={!quote}>{t("items.add")}</button>
              </>
            )
          ) : (
            <>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={t("items.amount")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <button type="submit">{t("items.add")}</button>
            </>
          )}
        </form>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        {isOwner && available.includes("submit") && (
          <button onClick={() => void act("submit")}>{t("reports.submit")}</button>
        )}
        {canManage && (
          <>
            <button onClick={() => void act("approve")}>{t("reports.approve")}</button>
            <button onClick={() => void act("reject")}>{t("reports.reject")}</button>
            <button onClick={() => void act("revise")}>{t("reports.revise")}</button>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify web type-check and build**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` and `vite build` succeed. (Note the category `<select>` `onChange` now casts to `Category`, and the money `<button>` was moved into the non-mileage branch.)

- [ ] **Step 3: Commit**

```bash
git status   # confirm no .env staged
git add packages/web/src/pages/ReportDetailPage.tsx
git commit -m "feat(web): mileage entry sub-form with quote step in report detail"
```

---

## Task 8: Playwright E2E — mileage happy path

**Files:**
- Create: `packages/web/e2e/mileage.spec.ts`

- [ ] **Step 1: Ensure the dev DB is migrated and seeded**

Run: `npm run prisma:migrate --workspace packages/server` (idempotent if already applied) and `npm run seed:dev --workspace packages/server`.
Expected: dev users `admin@azienda.it`, `responsabile@azienda.it`, `dipendente@azienda.it` (all `password123`) exist.

- [ ] **Step 2: Write the E2E spec**

Create `packages/web/e2e/mileage.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

const CSV =
  "year,make,model,fuel,variant,costPerKm\n" +
  "2026,Fiat,Panda,Benzina,1.2,0.6543\n";

test("employee adds a mileage item using an imported rate", async ({ page }) => {
  // Admin imports an ACI rate.
  await login(page, "admin@azienda.it");
  await page.getByRole("link", { name: "Tabelle ACI" }).click();
  await page.getByLabel("File CSV").setInputFiles({
    name: "rates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText("Importazione riuscita")).toBeVisible();
  await page.getByRole("button", { name: "Esci" }).click();

  // Employee registers a vehicle linked to the rate.
  await login(page, "dipendente@azienda.it");
  await page.getByRole("link", { name: "Veicoli" }).click();
  await page.getByPlaceholder("Cerca tariffa ACI (marca/modello)").fill("Panda");
  await page.getByRole("button", { name: "Cerca" }).click();
  await expect(page.getByLabel("Tariffa ACI")).toContainText("Panda");
  const vehicleLabel = `Auto E2E ${Date.now()}`;
  await page.getByPlaceholder("Nome veicolo").fill(vehicleLabel);
  await page.getByRole("button", { name: "Aggiungi veicolo" }).click();
  await expect(page.getByRole("cell", { name: vehicleLabel })).toBeVisible();

  // Create a report and add a mileage item.
  await page.getByRole("link", { name: "Note spese" }).click();
  const reportTitle = `Trasferta E2E ${Date.now()}`;
  await page.getByPlaceholder("Titolo della nota spese").fill(reportTitle);
  await page.getByRole("button", { name: "Crea nota spese" }).click();
  await page.getByRole("link", { name: "Apri" }).first().click();

  // Switch the category to mileage and fill the sub-form.
  await page.getByLabel("Categoria").selectOption({ label: "Rimborso chilometrico" });
  await page.getByLabel("Data").fill("2026-05-20");
  await page.getByPlaceholder("Descrizione").fill("Milano-Torino");
  await page.getByLabel("Veicolo").selectOption({ label: new RegExp(vehicleLabel) });
  await page.getByPlaceholder("Indirizzo di partenza").fill("Milano");
  await page.getByPlaceholder("Indirizzo di arrivo").fill("Torino");
  await page.getByLabel("Distanza stimata (km)").fill("100");
  await page.getByRole("button", { name: "Calcola" }).click();
  await expect(page.getByText(/Intervallo consentito/)).toBeVisible();
  await page.getByLabel("Km percorsi").fill("100");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();

  // 100 km * 0.6543 = 65,43 € shows in the row and the total.
  await expect(page.getByRole("cell", { name: "Milano-Torino" })).toBeVisible();
  await expect(page.getByText("65,43", { exact: false })).toBeVisible();
});
```

- [ ] **Step 3: Run the E2E spec**

Run: `npm run e2e --workspace packages/web -- mileage.spec.ts`
Expected: PASS — the mileage item appears with `65,43 €` reflected in the row/total. (The Playwright `webServer` config starts both dev servers automatically.)

If the seeded vehicle from a prior run collides, the unique timestamp in `vehicleLabel`/`reportTitle` avoids clashes; no manual cleanup needed.

- [ ] **Step 4: Commit**

```bash
git status   # confirm no .env staged
git add packages/web/e2e/mileage.spec.ts
git commit -m "test(web): E2E mileage item happy path"
```

---

## Task 9: Verify everything + README + finish branch

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full verification across the monorepo**

Run, in order:
- `npm run build --workspace packages/shared`
- `npm test --workspace packages/server`  → expect all green (existing 64 + new mileage tests).
- `npm test --workspace packages/web`  → expect the existing 3 web unit tests green.
- `npm run build --workspace packages/web`  → `tsc -b && vite build` clean.
- `npm run e2e --workspace packages/web`  → all E2E specs (3a + new mileage) green.

If any fail, fix before continuing.

- [ ] **Step 2: Update the README**

In `README.md`, move mileage out of the "Non ancora implementato (Slice 3b)" list and document it. Find the Slice 3a section's "Non ancora implementato (Slice 3b)" subsection and replace it with a new implemented subsection:

```markdown
### Funzionalità (Slice 3b — rimborso chilometrico)

- **Voce di rimborso chilometrico** nelle note spese: l'utente sceglie un veicolo
  (collegato a una tariffa ACI), inserisce partenza, arrivo, andata/ritorno e la
  distanza stimata, poi preme **Calcola** per vedere l'intervallo consentito
  (`baseline` → `baseline × (1 + tolleranza)`) e la tariffa €/km.
- Inserisce i **km percorsi**: oltre il limite superiore è obbligatoria una
  **giustificazione**; la voce viene contrassegnata per il responsabile.
- L'importo è calcolato dal server (`km × €/km`, arrotondato ai centesimi) e tutti
  i valori (tariffa, tolleranza, km, percorso) sono **congelati** sulla voce, così
  le note spese restano verificabili anche se le tabelle ACI o la tolleranza
  cambiano in seguito.
- Il calcolo della distanza è dietro un *port* `DistanceProvider`; oggi è manuale
  (`ManualDistanceProvider`), pronto per un provider di routing reale in futuro.

### Note per lo sviluppo (Slice 3b)

- Core puro in `@gsa/shared/src/mileage.ts`; ricostruire con
  `npm run build --workspace packages/shared` dopo le modifiche.
- Endpoint preventivo: `POST /api/items/mileage/quote`.
```

(Adjust the exact surrounding text to fit the existing README structure; keep the Slice 1/2/3a sections intact.)

- [ ] **Step 3: Commit the README**

```bash
git status   # confirm no .env staged
git add README.md
git commit -m "docs: README — Slice 3b mileage reimbursement"
```

- [ ] **Step 4: Finish the branch**

Use the **superpowers:finishing-a-development-branch** skill: it verifies tests, then presents the merge/PR/keep/discard options. (Tests were already verified in Step 1; the skill re-verifies.)

---

## Self-review (controller checklist before dispatch)

- **Spec coverage:** core (§4) → Task 1; provider (§5) → Task 2; data model (§6) → Task 3; quote (§7.1) → Task 4; MILEAGE create + snapshot + never-trust-client + justification gate (§7.2, §8) → Task 5; client/i18n (§9) → Task 6; UI sub-form (§9) → Task 7; tests (§10) spread across Tasks 1/2/4/5/8; README (§11) → Task 9. Mileage PATCH is intentionally excluded (spec §2). All covered.
- **Type/signature consistency:** `computeBaselineKm`, `toleranceRange`, `evaluateEnteredKm`, `mileageAmountCents` (Task 1) are used with identical signatures in Tasks 4 & 5. `DistanceQuery`/`ManualDistanceProvider.getDistanceKm` (Task 2) match the calls in Tasks 4 & 5. `MileageQuote`/`quoteMileage` (Task 6) match the UI in Task 7. `seedVehicle` (Task 3) matches its use in Tasks 4 & 5. Error codes match the conventions list.
- **No placeholders:** every code step contains complete code; every run step has an exact command and expected result.
```

