# Slice 3a — ACI Rates, Import, Vehicles & Settings (Mileage Data Foundation)

**Date:** 2026-05-31
**Status:** Approved design, pre-implementation
**Parent design:** `docs/superpowers/specs/2026-05-30-expense-management-design.md` (§7 Mileage Validation, §8 ACI Rates, §13 Data Model, §14 API Surface)

## 1. Purpose

Build the data foundation that mileage reimbursement (Slice 3b) will sit on:
the official ACI per-kilometre cost tables, the vehicles employees drive, and
the admin-configurable mileage tolerance. This slice ships **no change to the
expense report / item flow** — `MILEAGE` items remain rejected by item-create
until Slice 3b.

## 2. Scope

**In Slice 3a:**

- Prisma models: `AciRate`, `AciImportBatch`, `Vehicle`, `Setting`.
- Admin CSV import of ACI rates (normalized format, atomic, upsert-by-key).
- Authenticated ACI rate search (for vehicle linking).
- Employee vehicle CRUD, each vehicle linked to a chosen `AciRate`.
- Admin-configurable mileage tolerance percent (`Setting`, default 10).
- Italian frontend for all of the above.

**Deferred to Slice 3b (explicitly NOT in 3a):**

- Mileage columns on `ExpenseItem` (`vehicleId`, `originAddress`,
  `destinationAddress`, `roundTrip`, `baselineKm`, `tolerancePercent`,
  `enteredKm`, `ratePerKm`, `overageJustification`, `routeProvider`).
- The pure `mileage.ts` core (range, tolerance, km × rate, justification rule,
  round-trip doubling).
- The `DistanceProvider` port + `ManualDistanceProvider` + fake.
- `POST /api/items/mileage/quote`.
- Accepting `MILEAGE` on item create + snapshotting.
- The mileage item entry UI.

## 3. Decisions carried from brainstorming

These were settled for the overall mileage feature and shape 3a's data model,
even though their behaviour lands in 3b:

- **Routing:** manual baseline. The running app will use a
  `ManualDistanceProvider` (employee types the baseline km); the
  `DistanceProvider` port is built so a real geo provider drops in later.
  *(3b concern; no 3a code.)*
- **Mileage validation:** full §7 machinery (baseline + actual km + tolerance
  range + justification when over + round-trip doubling), fed by the manual
  baseline. *(3b concern.)*
- **ACI import format:** a **normalized CSV** the admin prepares, not the raw
  official ACI layout. *(3a — see §6.)*
- **Slice size:** the mileage feature is split into **3a** (this data
  foundation) and **3b** (mileage core + item flow + UI).

## 4. Data Model (Prisma / PostgreSQL)

Money stays integer cents elsewhere; ACI **rates are decimals** (€/km), per
parent design §13.

- **AciRate**: `id`, `year Int`, `make`, `model`, `fuel`, `variant`,
  `costPerKm Decimal`, `importBatchId`, `importBatch` relation, `createdAt`,
  `updatedAt`. Constraints: `@@unique([year, make, model, fuel, variant])`,
  `@@index([year])`. `vehicles Vehicle[]` back-relation.
- **AciImportBatch**: `id`, `year Int`, `fileName`, `rowCount Int`,
  `importedById`, `importedBy` relation to `User`, `importedAt DateTime`,
  `rates AciRate[]` back-relation.
- **Vehicle**: `id`, `userId`, `user` relation, `label`, `aciRateId`,
  `aciRate` relation, `plate String?`, `active Boolean @default(true)`,
  `createdAt`, `updatedAt`. `@@index([userId])`.
- **Setting**: `key String @id`, `value String`, `updatedAt DateTime @updatedAt`.
  Stores `mileageTolerancePercent`; absence means the default (10).

`User` gains back-relations: `vehicles Vehicle[]` and
`aciImportBatches AciImportBatch[]`.

A single Prisma migration adds these four models (and the `User`
back-relations). No existing column changes.

## 5. Pure logic in `@gsa/shared`

New module `aci.ts`, framework- and I/O-free:

- `MILEAGE_TOLERANCE_KEY = "mileageTolerancePercent"` and
  `DEFAULT_TOLERANCE_PERCENT = 10`.
- `parseTolerancePercent(value: string | null | undefined): number` — returns
  the stored integer percent, or `DEFAULT_TOLERANCE_PERCENT` when absent;
  clamps/validates to the 0–100 integer range.
- `validateAciRow(raw: Record<string, string>): AciRowResult` — a **pure
  validator/mapper** over an already-parsed CSV row object. Checks: `year` is a
  sane integer (e.g. 2000–2100), required text fields (`make`, `model`, `fuel`,
  `variant`) non-empty, `costPerKm` parses to a **positive** number. Returns
  either `{ ok: true, value: AciRateInput }` or
  `{ ok: false, errors: string[] }` with Italian messages.

CSV *parsing* (raw text → row objects) is **not** in shared — it lives in the
server's `aci` module using a small CSV-parser dependency, so shared stays pure
and only validates structured rows.

## 6. ACI Import — normalized CSV format & semantics

**Format (documented):**

- UTF-8 CSV, comma-separated, with a header row.
- Columns, in any order, matched by header name:
  `year,make,model,fuel,variant,costPerKm`.
- `costPerKm` uses a `.` decimal separator (e.g. `0.6543`).
- The admin (or a small prep step) normalizes the official ACI file to this
  shape; we do not parse ACI's raw idiosyncratic layout.

**Semantics:**

- **Atomic:** every row is validated first. If **any** row fails, the import is
  rejected `400 DATI_NON_VALIDI` with row-level Italian errors (row number +
  reason) and **nothing is written**.
- On success, rows are **upserted by the unique key**
  `(year, make, model, fuel, variant)` in a **single transaction**: existing
  matches update `costPerKm` and `importBatchId`; new keys are inserted. This
  preserves existing `Vehicle.aciRateId` references when an admin re-imports a
  year.
- An `AciImportBatch` row records `year`, `fileName`, `rowCount`, importer, and
  timestamp. (Import year is taken from the rows; a file mixing years is allowed
  and the batch `year` records the predominant/first — kept simple, one batch
  per upload.)

## 7. API Surface (under `/api`, role-guarded)

Reuses existing Italian error codes (`NON_AUTENTICATO`, `NON_AUTORIZZATO`,
`DATI_NON_VALIDI`) and adds `VEICOLO_NON_TROVATO`, `TARIFFA_ACI_NON_TROVATA`.

- `POST /api/aci/import` — **Admin only**. Multipart CSV upload
  (`@fastify/multipart`). Returns the created batch summary on success, or
  `400` with row-level errors. See §6.
- `GET /api/aci/rates?search=&year=` — **authenticated**. Case-insensitive
  search across `make`/`model`/`fuel`; optional `year` filter; result count
  limited (e.g. 50). Used by the vehicle form to pick a rate.
- `GET /api/vehicles` — **authenticated**. Current user's vehicles only.
- `POST /api/vehicles` — **authenticated**. Body `{ label, aciRateId, plate? }`;
  validates `aciRateId` exists (`TARIFFA_ACI_NON_TROVATA` → 400). Owner is the
  current user.
- `PATCH /api/vehicles/:id` — **authenticated**, owner-scoped
  (`VEICOLO_NON_TROVATO` → 404 if not owned). Updates `label`, `plate`,
  `active`.
- `GET /api/settings/mileage-tolerance` — **authenticated**. Returns
  `{ tolerancePercent }` (default 10 when unset).
- `PUT /api/settings/mileage-tolerance` — **Admin only**. Body
  `{ tolerancePercent }` validated as an integer 0–100; upserts the `Setting`.

**Vehicles are self-scoped** under `/api/vehicles` (current user), rather than
the parent design's `/users/:id/vehicles`: no current flow needs an admin to
manage another user's vehicles, so the simpler shape is used (YAGNI).

## 8. Frontend (Italian)

New `react-i18next` strings under `vehicles`, `aci`, `settings`, and `nav`
additions. New pages and nav entries:

- **Veicoli** (`/veicoli`, all roles): list the current user's vehicles
  (label, plate, linked rate, stato attivo); add form (label, plate, and a rate
  picker that searches `GET /api/aci/rates`); deactivate/reactivate.
- **Tabelle ACI** (`/tabelle-aci`, admin): CSV upload control; on success show
  the batch summary (anno, righe importate, importata il); on failure list
  row-level errors; a searchable table of imported rates.
- **Impostazioni** (`/impostazioni`, admin): the mileage tolerance percent
  field (load via GET, save via PUT).
- **NavBar:** add "Veicoli" (all authenticated users); add "Tabelle ACI" and
  "Impostazioni" for `ADMIN`.

Web API client (`packages/web/src/api/client.ts`) gains `Vehicle`, `AciRate`,
`AciImportBatch`, `ToleranceSetting` types and any needed multipart helper for
the CSV upload.

## 9. Testing Strategy (TDD)

Write the failing test first, watch it fail, then minimum code to pass.

- **Unit (Vitest, on `@gsa/shared`):** `validateAciRow` — valid row maps to
  `AciRateInput`; bad year, empty required field, non-numeric / non-positive
  `costPerKm` each rejected with an Italian error. `parseTolerancePercent` —
  default when absent, parse valid, clamp/reject out-of-range.
- **API (Vitest + Supertest, real test DB):**
  - ACI import: small valid CSV → rows + batch created; CSV with one bad row →
    `400`, **nothing written** (atomicity); re-import same year → upsert,
    existing `AciRate.id` preserved (a vehicle pointing at it still resolves);
    non-admin → `403`.
  - Rate search: `search` and `year` filters; result limit.
  - Vehicles: create (valid + invalid `aciRateId`); list returns only own
    vehicles; PATCH own vehicle; PATCH another user's vehicle → `404`
    (ownership scoping).
  - Settings: GET default (10) when unset; admin PUT then GET reflects new
    value; non-admin PUT → `403`; out-of-range value → `400`.
- **E2E (Playwright):** admin imports a 2-row CSV via the Tabelle ACI page →
  employee opens Veicoli, registers a vehicle linked to one of the imported
  rates, sees it listed. Thin.

## 10. Out of scope (3a)

Everything in §2 "Deferred to Slice 3b", plus (per parent design §17): OCR,
multi-tenancy, real routing/geocoding providers, automatic ACI scraping, and
admin-managing-another-user's vehicles.
