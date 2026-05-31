# Slice 3a — ACI Rates, Import, Vehicles & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mileage data foundation — admin-imported ACI per-km rate tables, employee vehicles linked to those rates, and an admin-configurable mileage tolerance — without touching the expense report/item flow.

**Architecture:** Pure validation/constants live in `@gsa/shared` (`aci.ts`); the server adds three thin Fastify modules (`aci`, `vehicles`, `settings`) following the existing `*.routes.ts` / `*.schemas.ts` / `*.service.ts` pattern, all mounted under `/api`. CSV text-parsing happens server-side (`csv-parse`); shared only validates already-parsed rows. ACI import is atomic and upserts by the unique key so re-imports never break vehicle links. The React frontend adds three Italian pages (Veicoli, Tabelle ACI, Impostazioni).

**Tech Stack:** TypeScript monorepo (npm workspaces); Fastify 4 + Prisma 5 + PostgreSQL; React 18 + Vite 5 + react-i18next; Vitest (unit + Supertest API) and Playwright (E2E). New deps: `@fastify/multipart` ^8, `csv-parse` ^5.

**Spec:** `docs/superpowers/specs/2026-05-31-slice3a-aci-vehicles-settings-design.md`

---

## Conventions (read before starting)

- **All commands run from the repo root** `/d/CodeProjects/GestioneSpeseAz` unless stated. Prefix with `cd /d/CodeProjects/GestioneSpeseAz &&` to be safe — the working directory has drifted in past sessions.
- **Server tests:** API tests in `packages/server/test/*.api.test.ts` use Supertest against a real test DB (`gestione_spese_test`), logging in via `POST /api/login`. Shared-module unit tests live in `packages/server/src/core/*.test.ts` and import from `@gsa/shared`.
- **After editing `@gsa/shared` you MUST rebuild it** (`npm run build --workspace packages/shared`) before server/web tsc or Vitest can see new exports — Vitest resolves `@gsa/shared` from its `dist/`.
- **Error responses:** `reply.code(N).send({ error: "CODICE_ITALIANO" })`. Existing codes: `NON_AUTENTICATO`, `NON_AUTORIZZATO`, `DATI_NON_VALIDI`, `NOTA_SPESE_NON_TROVATA`, etc. New in this slice: `VEICOLO_NON_TROVATO`, `TARIFFA_ACI_NON_TROVATA`.
- **Auth guards:** `{ preHandler: app.requireAuth }` (any logged-in user) or `{ preHandler: app.requireRole("ADMIN") }`. The user is `req.currentUser!` (`{ id, role }`).
- **Money is cents; ACI rates are decimals.** `costPerKm` is a Prisma `Decimal`; serialize it to a **string** in every API response (`r.costPerKm.toString()`) and treat it as a string on the web.
- **Web pages** are verified by `tsc -b` + the E2E happy path (matching Slice 1/2) — there are no per-page unit tests. Server/shared logic uses strict TDD (failing test first).
- **Commit messages** end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never stage `.env`.

## File Structure

**Create:**
- `packages/shared/src/aci.ts` — pure: `MILEAGE_TOLERANCE_KEY`, `DEFAULT_TOLERANCE_PERCENT`, `parseTolerancePercent`, `validateAciRow`, types `AciRateInput` / `AciRowResult`.
- `packages/server/src/aci/aci.service.ts` — `importAciCsv()` (parse + validate + atomic upsert).
- `packages/server/src/aci/aci.routes.ts` — `POST /import`, `GET /rates`.
- `packages/server/src/vehicles/vehicles.schemas.ts` — zod create/update.
- `packages/server/src/vehicles/vehicles.routes.ts` — list/create/patch (self-scoped).
- `packages/server/src/settings/settings.routes.ts` — get/put mileage tolerance.
- `packages/server/src/core/aci.test.ts` — unit tests for the shared `aci.ts`.
- `packages/server/test/aci.api.test.ts`, `vehicles.api.test.ts`, `settings.api.test.ts`.
- `packages/web/src/pages/VehiclesPage.tsx`, `AciRatesPage.tsx`, `SettingsPage.tsx`.
- `packages/web/e2e/aci-vehicles.spec.ts`.

**Modify:**
- `packages/server/prisma/schema.prisma` — 4 new models + `User` back-relations.
- `packages/server/src/app.ts` — register `@fastify/multipart` + the 3 new route groups.
- `packages/server/test/helpers.ts` — extend `resetDb`, add `seedAciRate`.
- `packages/server/package.json` — add deps.
- `packages/web/src/api/client.ts` — new types + `upload` helper.
- `packages/web/src/i18n.ts` — `vehicles` / `aci` / `settings` strings + `nav` entries.
- `packages/web/src/App.tsx` — 3 routes.
- `packages/web/src/components/NavBar.tsx` — 3 nav links.
- `README.md` — Slice 3a section.

---

## Task 1: Pure ACI domain in `@gsa/shared` (TDD)

**Files:**
- Create: `packages/shared/src/aci.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/server/src/core/aci.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/core/aci.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- src/core/aci.test.ts`
Expected: FAIL — `@gsa/shared` has no export `validateAciRow`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/shared/src/aci.ts`:

```ts
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
```

Add to `packages/shared/src/index.ts` (append a line):

```ts
export * from "./aci.js";
```

- [ ] **Step 4: Rebuild shared, then run the test to verify it passes**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/shared && npm run test --workspace packages/server -- src/core/aci.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/shared/src/aci.ts packages/shared/src/index.ts packages/server/src/core/aci.test.ts && git commit -m "$(cat <<'EOF'
Add pure ACI domain to @gsa/shared (validateAciRow, tolerance)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Prisma models + migration + test harness

**Files:**
- Modify: `packages/server/prisma/schema.prisma`
- Modify: `packages/server/test/helpers.ts`

- [ ] **Step 1: Add the four models and `User` back-relations to `schema.prisma`**

Add these two relation fields inside the existing `model User { ... }` block (after `reportEvents`):

```prisma
  vehicles         Vehicle[]
  aciImportBatches AciImportBatch[]
```

Append these four models at the end of `packages/server/prisma/schema.prisma`:

```prisma
model AciImportBatch {
  id           String    @id @default(cuid())
  year         Int
  fileName     String
  rowCount     Int
  importedById String
  importedBy   User      @relation(fields: [importedById], references: [id])
  importedAt   DateTime  @default(now())
  rates        AciRate[]
  @@index([importedById])
}

model AciRate {
  id            String         @id @default(cuid())
  year          Int
  make          String
  model         String
  fuel          String
  variant       String
  costPerKm     Decimal        @db.Decimal(8, 4)
  importBatchId String
  importBatch   AciImportBatch @relation(fields: [importBatchId], references: [id])
  vehicles      Vehicle[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  @@unique([year, make, model, fuel, variant])
  @@index([year])
}

model Vehicle {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  label     String
  aciRateId String
  aciRate   AciRate  @relation(fields: [aciRateId], references: [id])
  plate     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}

model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Create and apply the migration to the dev DB**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run prisma:migrate --workspace packages/server -- --name aci_vehicles_settings`
Expected: a new folder under `packages/server/prisma/migrations/` and "Your database is now in sync with your schema." Prisma Client is regenerated automatically.

- [ ] **Step 3: Apply the migration to the test DB**

Run:
```bash
cd /d/CodeProjects/GestioneSpeseAz/packages/server && TEST_DB=$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2- | tr -d '"') && DATABASE_URL="$TEST_DB" npx prisma migrate deploy
```
Expected: "X migrations applied" (the new migration runs against `gestione_spese_test`).

- [ ] **Step 4: Extend the test harness**

In `packages/server/test/helpers.ts`, update `resetDb` to clear the new tables in FK-safe order. Replace the body of `resetDb` with:

```ts
export async function resetDb(): Promise<void> {
  // Children before parents to satisfy foreign keys.
  await prisma.reportEvent.deleteMany({});
  await prisma.expenseItem.deleteMany({});
  await prisma.expenseReport.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.aciRate.deleteMany({});
  await prisma.aciImportBatch.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.user.deleteMany({});
}
```

Append this helper to the end of `packages/server/test/helpers.ts`:

```ts
// Seeds an ACI rate (with its required import batch) for vehicle/import tests.
export async function seedAciRate(opts: {
  importedById: string;
  year?: number;
  make?: string;
  model?: string;
  fuel?: string;
  variant?: string;
  costPerKm?: string;
}): Promise<{ id: string }> {
  const year = opts.year ?? 2026;
  const batch = await prisma.aciImportBatch.create({
    data: { year, fileName: "seed.csv", rowCount: 1, importedById: opts.importedById },
  });
  const rate = await prisma.aciRate.create({
    data: {
      year,
      make: opts.make ?? "Fiat",
      model: opts.model ?? "Panda",
      fuel: opts.fuel ?? "Benzina",
      variant: opts.variant ?? "1.2",
      costPerKm: opts.costPerKm ?? "0.6543",
      importBatchId: batch.id,
    },
  });
  return { id: rate.id };
}
```

- [ ] **Step 5: Verify the schema compiles and existing tests still pass**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server`
Expected: the full existing suite (37 tests) still PASSES against the migrated test DB.

- [ ] **Step 6: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/prisma packages/server/test/helpers.ts && git commit -m "$(cat <<'EOF'
Add AciRate, AciImportBatch, Vehicle, Setting models + migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Install deps + register multipart

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Install the new dependencies**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm install @fastify/multipart@^8.3.0 csv-parse@^5.5.6 --workspace packages/server`
Expected: both added to `packages/server/package.json` dependencies; install succeeds.

- [ ] **Step 2: Register multipart in `app.ts`**

In `packages/server/src/app.ts`, add the import near the other plugin imports:

```ts
import multipart from "@fastify/multipart";
```

And register it right after the `rateLimit` registration (before `sessionPlugin`):

```ts
  // Enables req.file() for the ACI CSV import endpoint.
  await app.register(multipart);
```

- [ ] **Step 3: Verify the app still boots and tests pass**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server`
Expected: existing suite still PASSES (no behavioural change yet).

- [ ] **Step 4: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/package.json packages/server/src/app.ts package-lock.json && git commit -m "$(cat <<'EOF'
Add @fastify/multipart + csv-parse; register multipart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ACI import endpoint (TDD)

**Files:**
- Create: `packages/server/src/aci/aci.service.ts`
- Create: `packages/server/src/aci/aci.routes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/aci.api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/aci.api.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, prisma } from "./helpers.js";

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

async function seedAdminAndEmployee() {
  const admin = await seedUser({
    email: "admin@example.com",
    password: "password123",
    fullName: "Anna Admin",
    role: "ADMIN",
  });
  const emp = await seedUser({
    email: "emp@example.com",
    password: "password123",
    fullName: "Elsa Dipendente",
    role: "EMPLOYEE",
  });
  return { admin, emp };
}

const GOOD_CSV =
  "year,make,model,fuel,variant,costPerKm\n" +
  "2026,Fiat,Panda,Benzina,1.2,0.6543\n" +
  "2026,Fiat,500,Benzina,1.0,0.6012\n";

describe("ACI import", () => {
  it("imports a valid CSV: creates rates + a batch (admin only)", async () => {
    await seedAdminAndEmployee();
    const admin = await loginAs("admin@example.com", "password123");

    const res = await admin
      .post("/api/aci/import")
      .attach("file", Buffer.from(GOOD_CSV), "rates.csv");

    expect(res.status).toBe(201);
    expect(res.body.rowCount).toBe(2);
    expect(res.body.year).toBe(2026);
    expect(await prisma.aciRate.count()).toBe(2);
    expect(await prisma.aciImportBatch.count()).toBe(1);
  });

  it("rejects atomically when any row is invalid (nothing written)", async () => {
    await seedAdminAndEmployee();
    const admin = await loginAs("admin@example.com", "password123");

    const bad =
      "year,make,model,fuel,variant,costPerKm\n" +
      "2026,Fiat,Panda,Benzina,1.2,0.6543\n" +
      "2026,Fiat,500,Benzina,1.0,-5\n";

    const res = await admin.post("/api/aci/import").attach("file", Buffer.from(bad), "rates.csv");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
    expect(Array.isArray(res.body.righe)).toBe(true);
    expect(await prisma.aciRate.count()).toBe(0);
    expect(await prisma.aciImportBatch.count()).toBe(0);
  });

  it("re-importing the same year upserts by key (rate ids preserved)", async () => {
    await seedAdminAndEmployee();
    const admin = await loginAs("admin@example.com", "password123");

    await admin.post("/api/aci/import").attach("file", Buffer.from(GOOD_CSV), "rates.csv");
    const before = await prisma.aciRate.findFirst({ where: { model: "Panda" } });

    const updated =
      "year,make,model,fuel,variant,costPerKm\n" +
      "2026,Fiat,Panda,Benzina,1.2,0.7000\n" +
      "2026,Fiat,500,Benzina,1.0,0.6012\n";
    await admin.post("/api/aci/import").attach("file", Buffer.from(updated), "rates.csv");

    const after = await prisma.aciRate.findFirst({ where: { model: "Panda" } });
    expect(await prisma.aciRate.count()).toBe(2); // no duplicates
    expect(after!.id).toBe(before!.id); // same row, preserves vehicle links
    expect(after!.costPerKm.toString()).toBe("0.7");
  });

  it("forbids non-admins (403)", async () => {
    await seedAdminAndEmployee();
    const emp = await loginAs("emp@example.com", "password123");
    const res = await emp.post("/api/aci/import").attach("file", Buffer.from(GOOD_CSV), "rates.csv");
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/aci.api.test.ts`
Expected: FAIL — `POST /api/aci/import` returns 404 (route not registered).

- [ ] **Step 3: Write the service**

Create `packages/server/src/aci/aci.service.ts`:

```ts
import { parse } from "csv-parse/sync";
import { prisma } from "../db.js";
import { validateAciRow, type AciRateInput } from "@gsa/shared";

export interface ImportRowError {
  row: number; // 1-based line number in the file (header is line 1)
  messages: string[];
}

export interface ImportBatchSummary {
  id: string;
  year: number;
  fileName: string;
  rowCount: number;
  importedAt: Date;
}

export type ImportResult =
  | { ok: true; batch: ImportBatchSummary }
  | { ok: false; errors: ImportRowError[] };

export async function importAciCsv(
  csvText: string,
  fileName: string,
  importedById: string,
): Promise<ImportResult> {
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return { ok: false, errors: [{ row: 1, messages: ["File CSV non valido."] }] };
  }
  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 1, messages: ["Il file non contiene righe di dati."] }] };
  }

  const valid: AciRateInput[] = [];
  const errors: ImportRowError[] = [];
  rows.forEach((raw, i) => {
    const result = validateAciRow(raw);
    if (result.ok) valid.push(result.value);
    else errors.push({ row: i + 2, messages: result.errors }); // +2: skip header, 1-based
  });
  if (errors.length > 0) return { ok: false, errors };

  const year = valid[0].year;
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.aciImportBatch.create({
      data: { year, fileName, rowCount: valid.length, importedById },
    });
    for (const r of valid) {
      await tx.aciRate.upsert({
        where: {
          year_make_model_fuel_variant: {
            year: r.year,
            make: r.make,
            model: r.model,
            fuel: r.fuel,
            variant: r.variant,
          },
        },
        update: { costPerKm: r.costPerKm, importBatchId: b.id },
        create: {
          year: r.year,
          make: r.make,
          model: r.model,
          fuel: r.fuel,
          variant: r.variant,
          costPerKm: r.costPerKm,
          importBatchId: b.id,
        },
      });
    }
    return b;
  });

  return {
    ok: true,
    batch: {
      id: batch.id,
      year: batch.year,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
      importedAt: batch.importedAt,
    },
  };
}
```

- [ ] **Step 4: Write the routes**

Create `packages/server/src/aci/aci.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { importAciCsv } from "./aci.service.js";

export async function aciRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/aci".

  // Admin uploads a normalized CSV (multipart, field name "file").
  app.post("/import", { preHandler: app.requireRole("ADMIN") }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const buf = await file.toBuffer();
    const result = await importAciCsv(buf.toString("utf-8"), file.filename, req.currentUser!.id);
    if (!result.ok) {
      return reply.code(400).send({ error: "DATI_NON_VALIDI", righe: result.errors });
    }
    return reply.code(201).send(result.batch);
  });

  // Search rates for vehicle linking. Authenticated; limited result set.
  app.get<{ Querystring: { search?: string; year?: string } }>(
    "/rates",
    { preHandler: app.requireAuth },
    async (req) => {
      const { search, year } = req.query;
      const where: Prisma.AciRateWhereInput = {};
      if (year) where.year = Number(year);
      if (search) {
        where.OR = [
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { fuel: { contains: search, mode: "insensitive" } },
        ];
      }
      const rates = await prisma.aciRate.findMany({
        where,
        orderBy: [{ year: "desc" }, { make: "asc" }, { model: "asc" }],
        take: 50,
      });
      return rates.map((r) => ({
        id: r.id,
        year: r.year,
        make: r.make,
        model: r.model,
        fuel: r.fuel,
        variant: r.variant,
        costPerKm: r.costPerKm.toString(),
      }));
    },
  );
}
```

- [ ] **Step 5: Wire the routes in `app.ts`**

In `packages/server/src/app.ts`, add the import:

```ts
import { aciRoutes } from "./aci/aci.routes.js";
```

And inside the `/api` register callback, after the `itemRoutes` line:

```ts
      await api.register(aciRoutes, { prefix: "/aci" });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/aci.api.test.ts`
Expected: PASS (all 4 import tests).

- [ ] **Step 7: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/src/aci packages/server/src/app.ts packages/server/test/aci.api.test.ts && git commit -m "$(cat <<'EOF'
Add ACI CSV import endpoint (atomic, upsert by key) + rate search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ACI rate search behaviour (TDD)

The `GET /api/aci/rates` route already exists from Task 4; this task pins its filter/limit behaviour with tests.

**Files:**
- Test: `packages/server/test/aci.api.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Append a new `describe` block to `packages/server/test/aci.api.test.ts`:

```ts
describe("ACI rate search", () => {
  it("filters by search term and by year, and requires auth", async () => {
    await seedAdminAndEmployee();
    const admin = await loginAs("admin@example.com", "password123");
    await admin.post("/api/aci/import").attach("file", Buffer.from(GOOD_CSV), "rates.csv");

    const anon = await request(app.server).get("/api/aci/rates");
    expect(anon.status).toBe(401);

    const emp = await loginAs("emp@example.com", "password123");

    const byModel = await emp.get("/api/aci/rates?search=Panda");
    expect(byModel.status).toBe(200);
    expect(byModel.body).toHaveLength(1);
    expect(byModel.body[0].model).toBe("Panda");
    expect(byModel.body[0].costPerKm).toBe("0.6543"); // serialized as string

    const byYear = await emp.get("/api/aci/rates?year=2025");
    expect(byYear.body).toHaveLength(0);

    const all = await emp.get("/api/aci/rates");
    expect(all.body).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it passes immediately (route already implemented)**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/aci.api.test.ts`
Expected: PASS. (If the search test fails, the bug is in the Task 4 route — fix it there.)

- [ ] **Step 3: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/test/aci.api.test.ts && git commit -m "$(cat <<'EOF'
Test ACI rate search filters (search/year/auth/serialization)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Vehicles module (TDD)

**Files:**
- Create: `packages/server/src/vehicles/vehicles.schemas.ts`
- Create: `packages/server/src/vehicles/vehicles.routes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/vehicles.api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/vehicles.api.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, seedAciRate } from "./helpers.js";

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

describe("vehicles", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).get("/api/vehicles");
    expect(res.status).toBe(401);
  });

  it("creates a vehicle linked to an ACI rate and lists only own vehicles", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const u1 = await seedUser({ email: "u1@x.it", password: "password123", fullName: "U1", role: "EMPLOYEE" });
    await seedUser({ email: "u2@x.it", password: "password123", fullName: "U2", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });

    const a1 = await loginAs("u1@x.it", "password123");
    const created = await a1.post("/api/vehicles").send({ label: "Auto personale", aciRateId: rate.id, plate: "AB123CD" });
    expect(created.status).toBe(201);
    expect(created.body.label).toBe("Auto personale");
    expect(created.body.aciRate.costPerKm).toBe("0.6543");

    // u2 has none; u1 sees exactly one.
    const a2 = await loginAs("u2@x.it", "password123");
    const u2list = await a2.get("/api/vehicles");
    expect(u2list.body).toHaveLength(0);

    const u1list = await a1.get("/api/vehicles");
    expect(u1list.body).toHaveLength(1);
  });

  it("rejects an unknown aciRateId with 400 TARIFFA_ACI_NON_TROVATA", async () => {
    await seedUser({ email: "u1@x.it", password: "password123", fullName: "U1", role: "EMPLOYEE" });
    const a1 = await loginAs("u1@x.it", "password123");
    const res = await a1.post("/api/vehicles").send({ label: "X", aciRateId: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("TARIFFA_ACI_NON_TROVATA");
  });

  it("patches own vehicle but returns 404 for another user's vehicle", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    await seedUser({ email: "u1@x.it", password: "password123", fullName: "U1", role: "EMPLOYEE" });
    await seedUser({ email: "u2@x.it", password: "password123", fullName: "U2", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });

    const a1 = await loginAs("u1@x.it", "password123");
    const created = await a1.post("/api/vehicles").send({ label: "Mia", aciRateId: rate.id });
    const id = created.body.id;

    const patched = await a1.patch(`/api/vehicles/${id}`).send({ active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.active).toBe(false);

    const a2 = await loginAs("u2@x.it", "password123");
    const forbidden = await a2.patch(`/api/vehicles/${id}`).send({ label: "Furto" });
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error).toBe("VEICOLO_NON_TROVATO");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/vehicles.api.test.ts`
Expected: FAIL — `/api/vehicles` returns 404.

- [ ] **Step 3: Write the schemas**

Create `packages/server/src/vehicles/vehicles.schemas.ts`:

```ts
import { z } from "zod";

export const createVehicleSchema = z.object({
  label: z.string().min(1),
  aciRateId: z.string().min(1),
  plate: z.string().min(1).nullish(),
});

export const updateVehicleSchema = z.object({
  label: z.string().min(1).optional(),
  plate: z.string().min(1).nullish(),
  active: z.boolean().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
```

- [ ] **Step 4: Write the routes**

Create `packages/server/src/vehicles/vehicles.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { createVehicleSchema, updateVehicleSchema } from "./vehicles.schemas.js";

const vehicleSelect = {
  id: true,
  label: true,
  plate: true,
  active: true,
  aciRateId: true,
  aciRate: {
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      fuel: true,
      variant: true,
      costPerKm: true,
    },
  },
} satisfies Prisma.VehicleSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof vehicleSelect }>;

// Decimal -> string for JSON.
function serialize(v: VehicleRow) {
  return { ...v, aciRate: { ...v.aciRate, costPerKm: v.aciRate.costPerKm.toString() } };
}

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/vehicles". All routes are self-scoped.

  app.get("/", { preHandler: app.requireAuth }, async (req) => {
    const me = req.currentUser!;
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: me.id },
      select: vehicleSelect,
      orderBy: { createdAt: "desc" },
    });
    return vehicles.map(serialize);
  });

  app.post("/", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createVehicleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;

    const rate = await prisma.aciRate.findUnique({ where: { id: parsed.data.aciRateId } });
    if (!rate) return reply.code(400).send({ error: "TARIFFA_ACI_NON_TROVATA" });

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: me.id,
        label: parsed.data.label,
        aciRateId: parsed.data.aciRateId,
        plate: parsed.data.plate ?? null,
      },
      select: vehicleSelect,
    });
    return reply.code(201).send(serialize(vehicle));
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateVehicleSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const me = req.currentUser!;

      const existing = await prisma.vehicle.findFirst({
        where: { id: req.params.id, userId: me.id },
      });
      if (!existing) return reply.code(404).send({ error: "VEICOLO_NON_TROVATO" });

      const data = parsed.data;
      const vehicle = await prisma.vehicle.update({
        where: { id: req.params.id },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.plate !== undefined ? { plate: data.plate } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
        select: vehicleSelect,
      });
      return serialize(vehicle);
    },
  );
}
```

- [ ] **Step 5: Wire the routes in `app.ts`**

Add the import:

```ts
import { vehicleRoutes } from "./vehicles/vehicles.routes.js";
```

And register after `aciRoutes`:

```ts
      await api.register(vehicleRoutes, { prefix: "/vehicles" });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/vehicles.api.test.ts`
Expected: PASS (all 4 vehicle tests).

- [ ] **Step 7: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/src/vehicles packages/server/src/app.ts packages/server/test/vehicles.api.test.ts && git commit -m "$(cat <<'EOF'
Add self-scoped vehicle CRUD linked to ACI rates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Settings (mileage tolerance) module (TDD)

**Files:**
- Create: `packages/server/src/settings/settings.routes.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/settings.api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/settings.api.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser } from "./helpers.js";

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

describe("mileage tolerance setting", () => {
  it("returns the default (10) when unset", async () => {
    await seedUser({ email: "emp@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const emp = await loginAs("emp@x.it", "password123");
    const res = await emp.get("/api/settings/mileage-tolerance");
    expect(res.status).toBe(200);
    expect(res.body.tolerancePercent).toBe(10);
  });

  it("lets an admin set it and reflects the new value", async () => {
    await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const admin = await loginAs("a@x.it", "password123");

    const put = await admin.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 15 });
    expect(put.status).toBe(200);
    expect(put.body.tolerancePercent).toBe(15);

    const get = await admin.get("/api/settings/mileage-tolerance");
    expect(get.body.tolerancePercent).toBe(15);
  });

  it("forbids a non-admin from setting it (403)", async () => {
    await seedUser({ email: "emp@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const emp = await loginAs("emp@x.it", "password123");
    const res = await emp.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 20 });
    expect(res.status).toBe(403);
  });

  it("rejects an out-of-range value (400)", async () => {
    await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const admin = await loginAs("a@x.it", "password123");
    const res = await admin.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/settings.api.test.ts`
Expected: FAIL — `/api/settings/mileage-tolerance` returns 404.

- [ ] **Step 3: Write the routes**

Create `packages/server/src/settings/settings.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { MILEAGE_TOLERANCE_KEY, parseTolerancePercent } from "@gsa/shared";

const toleranceSchema = z.object({
  tolerancePercent: z.number().int().min(0).max(100),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/settings".

  app.get("/mileage-tolerance", { preHandler: app.requireAuth }, async () => {
    const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
    return { tolerancePercent: parseTolerancePercent(setting?.value) };
  });

  app.put("/mileage-tolerance", { preHandler: app.requireRole("ADMIN") }, async (req, reply) => {
    const parsed = toleranceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const value = String(parsed.data.tolerancePercent);
    await prisma.setting.upsert({
      where: { key: MILEAGE_TOLERANCE_KEY },
      update: { value },
      create: { key: MILEAGE_TOLERANCE_KEY, value },
    });
    return { tolerancePercent: parsed.data.tolerancePercent };
  });
}
```

- [ ] **Step 4: Wire the routes in `app.ts`**

Add the import:

```ts
import { settingsRoutes } from "./settings/settings.routes.js";
```

And register after `vehicleRoutes`:

```ts
      await api.register(settingsRoutes, { prefix: "/settings" });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server -- test/settings.api.test.ts`
Expected: PASS (all 4 settings tests).

- [ ] **Step 6: Run the full server suite**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run test --workspace packages/server`
Expected: ALL server tests pass (existing 37 + new ACI/vehicles/settings).

- [ ] **Step 7: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/server/src/settings packages/server/src/app.ts packages/server/test/settings.api.test.ts && git commit -m "$(cat <<'EOF'
Add admin-configurable mileage tolerance setting (default 10)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Web API client types + upload helper

**Files:**
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1a: Extend the `ApiError` interface**

In `packages/web/src/api/client.ts`, add a `body` field to the existing `ApiError` interface so callers can read row-level import errors:

```ts
export interface ApiError {
  status: number;
  code?: string;
  body?: Record<string, unknown>;
}
```

- [ ] **Step 1: Add an `upload` method to the `api` object**

In `packages/web/src/api/client.ts`, replace the `export const api = { ... };` block with:

```ts
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData, // browser sets the multipart boundary; do NOT set Content-Type
  });
  if (!res.ok) {
    let body: Record<string, unknown> | undefined;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    // Surface the whole parsed body (e.g. { error, righe }) so callers can show
    // row-level import errors, not just the code.
    const err: ApiError = { status: res.status, code: body?.error as string | undefined, body };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload,
};
```

(Note: this also adds a `put` method, used by the settings page.)

- [ ] **Step 2: Append the new types**

At the end of `packages/web/src/api/client.ts`:

```ts
export interface AciRate {
  id: string;
  year: number;
  make: string;
  model: string;
  fuel: string;
  variant: string;
  costPerKm: string; // decimal serialized as string
}

export interface Vehicle {
  id: string;
  label: string;
  plate: string | null;
  active: boolean;
  aciRateId: string;
  aciRate: AciRate;
}

export interface AciImportBatch {
  id: string;
  year: number;
  fileName: string;
  rowCount: number;
  importedAt: string;
}

export interface ToleranceSetting {
  tolerancePercent: number;
}
```

- [ ] **Step 3: Verify the web build compiles**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/web`
Expected: `tsc -b && vite build` succeed with no type errors.

- [ ] **Step 4: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/src/api/client.ts && git commit -m "$(cat <<'EOF'
Add web API types for vehicles/ACI/settings + upload & put helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Italian i18n strings

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Extend the `nav` block**

In the `nav: { ... }` object in `packages/web/src/i18n.ts`, add three keys:

```ts
      vehicles: "Veicoli",
      aci: "Tabelle ACI",
      settings: "Impostazioni",
```

- [ ] **Step 2: Add three new translation blocks**

Add these blocks to the `translation` object (e.g. after the `items` block):

```ts
    vehicles: {
      title: "I miei veicoli",
      add: "Aggiungi veicolo",
      label: "Nome veicolo",
      plate: "Targa",
      rate: "Tariffa ACI",
      rateSearch: "Cerca tariffa ACI (marca/modello)",
      search: "Cerca",
      status: { active: "Attivo", inactive: "Disattivato" },
      deactivate: "Disattiva",
      activate: "Riattiva",
      empty: "Nessun veicolo registrato.",
      noRate: "Nessuna tariffa selezionata.",
      createError: "Impossibile registrare il veicolo.",
    },
    aci: {
      title: "Tabelle ACI",
      import: "Importa",
      file: "File CSV",
      help: "Formato CSV: intestazione year,make,model,fuel,variant,costPerKm (separatore decimale '.').",
      imported: "Importazione riuscita",
      batchYear: "Anno",
      batchRows: "Righe importate",
      batchAt: "Importata il",
      errors: "Righe con errori",
      row: "Riga",
      search: "Cerca",
      searchPlaceholder: "Cerca per marca/modello",
      empty: "Nessuna tariffa presente.",
      importError: "Importazione non riuscita.",
      colYear: "Anno",
      colMake: "Marca",
      colModel: "Modello",
      colFuel: "Alimentazione",
      colVariant: "Variante",
      colCost: "€/km",
    },
    settings: {
      title: "Impostazioni",
      tolerance: "Tolleranza chilometrica (%)",
      save: "Salva",
      saved: "Impostazioni salvate.",
      saveError: "Impossibile salvare le impostazioni.",
    },
```

- [ ] **Step 3: Verify the web build compiles**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/web`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/src/i18n.ts && git commit -m "$(cat <<'EOF'
Add Italian strings for vehicles, ACI import, and settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Veicoli page + route + nav

**Files:**
- Create: `packages/web/src/pages/VehiclesPage.tsx`
- Modify: `packages/web/src/App.tsx`, `packages/web/src/components/NavBar.tsx`

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/VehiclesPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type Vehicle, type AciRate } from "../api/client.js";

export function VehiclesPage(): JSX.Element {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [plate, setPlate] = useState("");
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<AciRate[]>([]);
  const [aciRateId, setAciRateId] = useState("");

  async function refresh(): Promise<void> {
    setVehicles(await api.get<Vehicle[]>("/vehicles"));
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function searchRates(e: FormEvent): Promise<void> {
    e.preventDefault();
    const found = await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(search)}`);
    setRates(found);
    setAciRateId(found[0]?.id ?? "");
  }

  async function addVehicle(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/vehicles", { label, aciRateId, plate: plate || null });
      setLabel("");
      setPlate("");
      await refresh();
    } catch {
      setError(t("vehicles.createError"));
    }
  }

  async function toggleActive(v: Vehicle): Promise<void> {
    await api.patch(`/vehicles/${v.id}`, { active: !v.active });
    await refresh();
  }

  const rateLabel = (r: AciRate): string => `${r.make} ${r.model} ${r.fuel} ${r.variant} (${r.year})`;

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("vehicles.title")}</h1>

      <form onSubmit={searchRates} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder={t("vehicles.rateSearch")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">{t("vehicles.search")}</button>
      </form>

      <form onSubmit={addVehicle} style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 24 }}>
        <select aria-label={t("vehicles.rate")} value={aciRateId} onChange={(e) => setAciRateId(e.target.value)} required>
          {rates.length === 0 ? (
            <option value="">{t("vehicles.noRate")}</option>
          ) : (
            rates.map((r) => (
              <option key={r.id} value={r.id}>{rateLabel(r)} — {r.costPerKm} €/km</option>
            ))
          )}
        </select>
        <input placeholder={t("vehicles.label")} value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input placeholder={t("vehicles.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} />
        <button type="submit">{t("vehicles.add")}</button>
      </form>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : vehicles.length === 0 ? (
        <p>{t("vehicles.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("vehicles.label")}</th>
              <th style={{ textAlign: "left" }}>{t("vehicles.plate")}</th>
              <th style={{ textAlign: "left" }}>{t("vehicles.rate")}</th>
              <th style={{ textAlign: "left" }}>{t("users.role")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>{v.label}</td>
                <td>{v.plate ?? "—"}</td>
                <td>{rateLabel(v.aciRate)}</td>
                <td>{v.active ? t("vehicles.status.active") : t("vehicles.status.inactive")}</td>
                <td>
                  <button onClick={() => void toggleActive(v)}>
                    {v.active ? t("vehicles.deactivate") : t("vehicles.activate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import:

```ts
import { VehiclesPage } from "./pages/VehiclesPage.js";
```

Add inside the authenticated `<Routes>` (before the catch-all `*`):

```tsx
        <Route path="/veicoli" element={<VehiclesPage />} />
```

- [ ] **Step 3: Add the nav link in `NavBar.tsx`**

After the reports `<Link>` line, add (visible to everyone):

```tsx
      <Link to="/veicoli">{t("nav.vehicles")}</Link>
```

- [ ] **Step 4: Verify the web build compiles**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/web`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/src/pages/VehiclesPage.tsx packages/web/src/App.tsx packages/web/src/components/NavBar.tsx && git commit -m "$(cat <<'EOF'
Add Veicoli page (vehicle registration linked to ACI rates)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Tabelle ACI page (admin) + route + nav

**Files:**
- Create: `packages/web/src/pages/AciRatesPage.tsx`
- Modify: `packages/web/src/App.tsx`, `packages/web/src/components/NavBar.tsx`

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/AciRatesPage.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type AciRate, type AciImportBatch } from "../api/client.js";
import { formatDateIt } from "../format.js";

interface ImportRowError {
  row: number;
  messages: string[];
}

export function AciRatesPage(): JSX.Element {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<AciImportBatch | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<AciRate[]>([]);

  async function refreshRates(term = ""): Promise<void> {
    setRates(await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(term)}`));
  }

  useEffect(() => {
    void refreshRates();
  }, []);

  async function onImport(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setRowErrors([]);
    setBatch(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await api.upload<AciImportBatch>("/aci/import", fd);
      setBatch(result);
      await refreshRates(search);
    } catch (err) {
      // The upload helper attaches the full parsed body as `body`; the import
      // endpoint returns { error, righe } on a 400.
      const apiErr = err as { body?: { righe?: ImportRowError[] } };
      setError(t("aci.importError"));
      if (Array.isArray(apiErr.body?.righe)) setRowErrors(apiErr.body!.righe);
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault();
    await refreshRates(search);
  }

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("aci.title")}</h1>
      <p style={{ color: "#555" }}>{t("aci.help")}</p>

      <form onSubmit={onImport} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label={t("aci.file")} required />
        <button type="submit">{t("aci.import")}</button>
      </form>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
      {batch && (
        <p style={{ color: "#15803d" }}>
          {t("aci.imported")}: {t("aci.batchYear")} {batch.year}, {t("aci.batchRows")} {batch.rowCount},{" "}
          {t("aci.batchAt")} {formatDateIt(batch.importedAt)}
        </p>
      )}
      {rowErrors.length > 0 && (
        <div>
          <h3>{t("aci.errors")}</h3>
          <ul>
            {rowErrors.map((re) => (
              <li key={re.row}>{t("aci.row")} {re.row}: {re.messages.join(" ")}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          placeholder={t("aci.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">{t("aci.search")}</button>
      </form>

      {rates.length === 0 ? (
        <p>{t("aci.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("aci.colYear")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colMake")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colModel")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colFuel")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colVariant")}</th>
              <th style={{ textAlign: "right" }}>{t("aci.colCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.year}</td>
                <td>{r.make}</td>
                <td>{r.model}</td>
                <td>{r.fuel}</td>
                <td>{r.variant}</td>
                <td style={{ textAlign: "right" }}>{r.costPerKm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import:

```ts
import { AciRatesPage } from "./pages/AciRatesPage.js";
```

Add inside the authenticated `<Routes>` (before the catch-all):

```tsx
        <Route path="/tabelle-aci" element={<AciRatesPage />} />
```

- [ ] **Step 3: Add the admin-only nav link in `NavBar.tsx`**

Next to the existing `user.role === "ADMIN"` users link, add an ACI link guarded the same way. Replace the admin users link line with:

```tsx
      {user.role === "ADMIN" && <Link to="/tabelle-aci">{t("nav.aci")}</Link>}
      {user.role === "ADMIN" && <Link to="/utenti">{t("nav.users")}</Link>}
```

- [ ] **Step 4: Verify the web build compiles**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/web`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/src/pages/AciRatesPage.tsx packages/web/src/App.tsx packages/web/src/components/NavBar.tsx && git commit -m "$(cat <<'EOF'
Add Tabelle ACI page: CSV import + rate browser (admin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Impostazioni page (admin) + route + nav

**Files:**
- Create: `packages/web/src/pages/SettingsPage.tsx`
- Modify: `packages/web/src/App.tsx`, `packages/web/src/components/NavBar.tsx`

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/SettingsPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type ToleranceSetting } from "../api/client.js";

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const [tolerance, setTolerance] = useState("10");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ToleranceSetting>("/settings/mileage-tolerance")
      .then((s) => setTolerance(String(s.tolerancePercent)));
  }, []);

  async function onSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const result = await api.put<ToleranceSetting>("/settings/mileage-tolerance", {
        tolerancePercent: Number(tolerance),
      });
      setTolerance(String(result.tolerancePercent));
      setSaved(true);
    } catch {
      setError(t("settings.saveError"));
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("settings.title")}</h1>
      <form onSubmit={onSave} style={{ display: "grid", gap: 8 }}>
        <label>
          {t("settings.tolerance")}
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            aria-label={t("settings.tolerance")}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
        <button type="submit">{t("settings.save")}</button>
      </form>
      {saved && <p style={{ color: "#15803d" }}>{t("settings.saved")}</p>}
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import:

```ts
import { SettingsPage } from "./pages/SettingsPage.js";
```

Add inside the authenticated `<Routes>` (before the catch-all):

```tsx
        <Route path="/impostazioni" element={<SettingsPage />} />
```

- [ ] **Step 3: Add the admin-only nav link in `NavBar.tsx`**

After the Tabelle ACI admin link, add:

```tsx
      {user.role === "ADMIN" && <Link to="/impostazioni">{t("nav.settings")}</Link>}
```

- [ ] **Step 4: Verify the web build compiles**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/web`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/src/pages/SettingsPage.tsx packages/web/src/App.tsx packages/web/src/components/NavBar.tsx && git commit -m "$(cat <<'EOF'
Add Impostazioni page: mileage tolerance (admin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: E2E happy path (admin imports → employee registers vehicle)

**Files:**
- Create: `packages/web/e2e/aci-vehicles.spec.ts`

Precondition: `npm run seed:dev --workspace packages/server` has created `admin@azienda.it` (ADMIN) and `dipendente@azienda.it` (EMPLOYEE), both `password123`. Playwright's `webServer` config starts both servers.

- [ ] **Step 1: Write the E2E test**

Create `packages/web/e2e/aci-vehicles.spec.ts`:

```ts
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

test("admin imports ACI rates; employee registers a vehicle", async ({ page }) => {
  // Admin imports a rate table.
  await login(page, "admin@azienda.it");
  await page.getByRole("link", { name: "Tabelle ACI" }).click();
  await expect(page.getByRole("heading", { name: "Tabelle ACI" })).toBeVisible();
  await page.getByLabel("File CSV").setInputFiles({
    name: "rates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText("Importazione riuscita")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Panda" })).toBeVisible();

  // Employee registers a vehicle linked to an imported rate.
  await page.getByRole("button", { name: "Esci" }).click();
  await login(page, "dipendente@azienda.it");
  await page.getByRole("link", { name: "Veicoli" }).click();
  await expect(page.getByRole("heading", { name: "I miei veicoli" })).toBeVisible();

  await page.getByPlaceholder("Cerca tariffa ACI (marca/modello)").fill("Panda");
  await page.getByRole("button", { name: "Cerca" }).click();
  // The rate dropdown is now populated; the first match is auto-selected.
  await expect(page.getByLabel("Tariffa ACI")).toContainText("Panda");

  const label = `Auto E2E ${Date.now()}`;
  await page.getByPlaceholder("Nome veicolo").fill(label);
  await page.getByPlaceholder("Targa").fill("AB123CD");
  await page.getByRole("button", { name: "Aggiungi veicolo" }).click();

  await expect(page.getByRole("cell", { name: label })).toBeVisible();
});
```

- [ ] **Step 2: Seed dev users and run the E2E test**

Run:
```bash
cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/shared && npm run seed:dev --workspace packages/server && npm run e2e --workspace packages/web -- aci-vehicles.spec.ts
```
Expected: the spec PASSES. (Playwright starts both dev servers; the dev DB must be migrated — Task 2 Step 2 handled this.)

- [ ] **Step 3: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add packages/web/e2e/aci-vehicles.spec.ts && git commit -m "$(cat <<'EOF'
Add E2E: admin imports ACI rates, employee registers a vehicle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Verify everything + README + self-review

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the entire test suite across workspaces**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run build --workspace packages/shared && npm test --workspaces --if-present`
Expected: server suite green (existing 37 + new ACI 5 + vehicles 5 + settings 4 = ~51), web unit green (3).

- [ ] **Step 2: Run the full E2E suite**

Run: `cd /d/CodeProjects/GestioneSpeseAz && npm run e2e --workspace packages/web`
Expected: both the Slice 2 reports spec and the new aci-vehicles spec PASS.

- [ ] **Step 3: Update the README**

In `README.md`, add a "Funzionalità (Slice 3a)" section after the Slice 2 section:

```markdown
## Funzionalità (Slice 3a — fondamenta rimborso chilometrico)

- **Tabelle ACI (Admin):** importazione delle tariffe €/km da file CSV normalizzato
  (intestazione `year,make,model,fuel,variant,costPerKm`, separatore decimale `.`).
  L'import è atomico: se una riga è errata, nulla viene salvato e vengono mostrati
  gli errori riga per riga. Re-importare lo stesso anno aggiorna le righe esistenti
  (upsert) preservando i collegamenti dei veicoli.
- **Veicoli (Dipendente):** registrazione dei propri veicoli, ciascuno collegato a
  una tariffa ACI scelta tramite ricerca per marca/modello; attivazione/disattivazione.
- **Impostazioni (Admin):** tolleranza chilometrica configurabile (default 10%).

### Note per lo sviluppo

- Utenti di prova (`npm run seed:dev --workspace packages/server`): `admin@azienda.it`,
  `responsabile@azienda.it`, `dipendente@azienda.it` (password `password123`).
- Esempio CSV ACI:
  ```csv
  year,make,model,fuel,variant,costPerKm
  2026,Fiat,Panda,Benzina,1.2,0.6543
  ```

### Non ancora implementato (Slice 3b)

- Voci di tipo `MILEAGE` nelle note spese (calcolo km × tariffa, baseline manuale,
  tolleranza e giustificazione, andata/ritorno), il port `DistanceProvider` e
  l'endpoint di preventivo. Finché non arriva la Slice 3b, l'API rifiuta le voci
  `MILEAGE` con `DATI_NON_VALIDI`.
```

- [ ] **Step 4: Self-review the diff**

Run: `cd /d/CodeProjects/GestioneSpeseAz && git status && git diff --stat HEAD~13`
Confirm: no `.env` staged anywhere; all new files present; no stray debug code.

- [ ] **Step 5: Commit**

```bash
cd /d/CodeProjects/GestioneSpeseAz && git add README.md && git commit -m "$(cat <<'EOF'
Document Slice 3a (ACI import, vehicles, tolerance) in README

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Finish the branch**

Invoke the `superpowers:finishing-a-development-branch` skill to verify tests and present merge options.

---

## Self-Review (plan vs. spec)

**Spec coverage:**
- §4 data model (AciRate, AciImportBatch, Vehicle, Setting + User back-relations) → Task 2. ✅
- §5 pure `aci.ts` (validateAciRow, parseTolerancePercent, constants) → Task 1. ✅
- §6 import (normalized CSV, atomic, upsert-by-key, batch) → Tasks 3 (deps/multipart) + 4 (service/route/tests). ✅
- §7 API: `POST /aci/import` → T4; `GET /aci/rates` → T4 + T5; vehicles GET/POST/PATCH self-scoped → T6; settings GET/PUT → T7; new error codes `VEICOLO_NON_TROVATO`/`TARIFFA_ACI_NON_TROVATA` → T6. ✅
- §8 frontend: Veicoli → T10; Tabelle ACI → T11; Impostazioni → T12; nav additions → T10–12; client types/upload → T8; i18n → T9. ✅
- §9 testing: unit (T1), API import/search/vehicles/settings (T4–T7), E2E (T13). ✅
- §10 out-of-scope: no `ExpenseItem` mileage columns, no `mileage.ts`, no DistanceProvider, no quote endpoint, MILEAGE still rejected — none of these appear in any task. ✅

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✅

**Type consistency:** `AciRateInput.costPerKm` is a string in shared (T1), consumed as a string by the import service (T4) and serialized as a string everywhere (`.toString()` in T4/T6; `costPerKm: string` in the web type T8). `validateAciRow` / `parseTolerancePercent` / `MILEAGE_TOLERANCE_KEY` names match across T1, T4, T7. The upsert compound key `year_make_model_fuel_variant` matches the `@@unique` in T2. `api.upload` (T8) is used in T11; `api.put` (T8) in T12. `seedAciRate` (T2) is used in T6. ✅
