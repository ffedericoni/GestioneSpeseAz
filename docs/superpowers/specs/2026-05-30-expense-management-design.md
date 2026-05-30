# Company Expense Management — Design

**Date:** 2026-05-30
**Status:** Approved design, pre-implementation

## 1. Problem

Track company expenses incurred by employees, route them through a manager
approval workflow, and produce the reimbursable amount the company owes each
employee. Expenses flow through a defined lifecycle from creation to payment.

Italian context: mileage is reimbursed using the official **ACI** per-kilometre
cost tables (*costo chilometrico*).

## 2. Scope & Principles

- **Tenancy:** single company now, but the data model and code are kept clean
  enough to add multi-tenancy later without a rewrite. No tenant isolation is
  built yet.
- **Start simple:** manual data entry only. **No OCR** of invoices/receipts.
- **TDD throughout:** failing test first, then minimum code to pass.
- **YAGNI:** no features beyond what is described here.
- **Money is always stored as integer cents** (never floating point).
- **Currency:** EUR only.

## 3. Roles

| Role | Responsibilities |
|------|------------------|
| **Employee** | Creates expense reports, adds line items, submits, resubmits after revision. |
| **Manager** | Reviews submitted reports of their direct reports: approve, send back for revision, or reject. |
| **Finance** | Sends approved reports for payment, marks them paid, exports for accounting. Can override a manager decision. |
| **Admin** | Manages users, manager assignments, and the ACI tables (and the mileage tolerance setting). Can do anything Finance can. |

Each user has a single `role` and an optional `managerId` (the user who approves
their reports).

## 4. Unit of Work: the Expense Report (nota spese)

The **expense report** is the unit that flows through the state machine. A report
belongs to one employee and contains many **expense items** (line items). The
manager approves the whole report; Finance pays one total per report.

## 5. State Machine

States: `CREATED`, `READY_FOR_APPROVAL`, `IN_REVISION`, `APPROVED`, `REJECTED`,
`SENT_FOR_PAYMENT`, `PAID`.

```
CREATED ──submit──> READY_FOR_APPROVAL ──manager reviews──>
        ┌─ approve ─> APPROVED ─send-for-payment─> SENT_FOR_PAYMENT ─mark-paid─> PAID
        ├─ revise  ─> IN_REVISION ──resubmit──> READY_FOR_APPROVAL  (loop)
        └─ reject  ─> REJECTED (terminal)
```

### Editing & permission phases

1. **On hold (employee-editable):** `CREATED`, `READY_FOR_APPROVAL`,
   `IN_REVISION`. Before any manager decision exists, the employee may freely
   edit the report and its items. Submitting does **not** lock editing.
2. **Manager decision (employee locked out):** once the manager has decided
   (`APPROVED` or `REJECTED`), the employee can no longer edit.
3. **Finance/Admin:** drive `SENT_FOR_PAYMENT` and `PAID`, and may **override**
   a manager decision (e.g. reverse a rejection, or bounce an approved report
   back).

Terminal states: `REJECTED` and `PAID` (subject to Finance/Admin override of a
manager decision).

Every transition is recorded in a `ReportEvent` audit row (actor, from-state,
to-state, optional comment such as a revision reason).

## 6. Expense Categories

- `MILEAGE` — distance-based, calculated from the ACI table (see §8).
- `MEALS_LODGING` — restaurant, hotel; direct money amount.
- `TRANSPORT` — train, flight, taxi, parking, tolls, fuel; direct money amount.
- `OTHER` — catch-all with free description.

All money categories support an **optional VAT/IVA** field. VAT is a plain field,
not a tax engine.

### Capturing extra real costs (traffic, detours, etc.)

The ACI rate is an all-inclusive statutory average; adding a traffic/fuel
multiplier would make the excess taxable, so we do **not** do that. Instead:

- Mileage `km` means **actual distance driven**, so detours are reimbursed by
  entering the real distance (validated against a baseline — see §7).
- Genuine extra cash outlays (tolls, parking, ZTL, extra fuel) are entered as
  separate **receipted** `TRANSPORT`/`OTHER` items.
- An optional `notes` field on items lets the employee explain anomalies.

## 7. Mileage Validation (baseline + tolerance)

When an employee adds a `MILEAGE` item:

1. They provide an **origin**, a **destination**, and an optional **round-trip**
   toggle. (One leg per item; multiple journeys = multiple items.)
2. The app calls a routing service to compute a **baseline distance** (realistic
   practical route; doubled if round-trip).
3. The **allowed range** is `baseline` → `baseline × (1 + tolerancePercent)`.
   `tolerancePercent` defaults to **10%** but is an **Admin-configurable
   setting**, not hard-coded.
4. The employee enters **actual km driven**:
   - At or below the upper bound → accepted.
   - **Above** the upper bound → accepted **only with a justification**; the item
     is flagged so the manager sees it during review.
   - Below baseline is allowed and needs no justification (it only saves money).
5. `amountCents = round(enteredKm × ratePerKm)`.

**Routing is behind a port.** `DistanceProvider` is an interface
(`getDistanceKm(origin, destination, roundTrip)`). A **fake implementation** is
used in all automated tests (never hits the network / burns quota). The real
provider is **deferred** — chosen when mileage is implemented — and swapped in
without touching the rest of the app.

**Snapshotting:** `baselineKm`, `tolerancePercent`, `enteredKm`, `ratePerKm`,
`overageJustification`, and the routing provider/route used are all snapshotted
onto the item at entry time, so reports remain auditable even if the ACI table,
the tolerance setting, or maps data change later.

## 8. ACI Mileage Rates

- Full official ACI dataset is supported.
- **Admin uploads the annual official file** (CSV/Excel) through an import
  screen. The system parses it into dated `AciRate` rows tagged with an
  effective `year` and an import batch. No scraping/auto-fetch.
- Employees register **Vehicles**, each linked to a chosen `AciRate`. Selecting
  a vehicle on a mileage item provides the `ratePerKm`.

## 9. Payment

- The system computes the **reimbursable total** per report (sum of item
  amounts).
- Finance transitions reports to `SENT_FOR_PAYMENT` and then `PAID`, recording a
  **payment date** and a **payment reference**.
- Finance can **export** approved/sent reports as a **CSV file** for the
  accounting system. No direct bank/payment integration.

## 10. Authentication

- **Email + password.** Hashed passwords, role assigned per user, session login.
- Admin creates users. No external SSO (could be added later behind the auth
  module's interface).

## 11. Tech Stack

TypeScript monorepo (npm workspaces):

- **Backend:** Node + **Fastify**, **Prisma** ORM, **PostgreSQL**.
- **Frontend:** **React + Vite + TypeScript** (web app).
- **Tests:** **Vitest** (unit), **Supertest** (API integration), **Playwright**
  (E2E).

## 12. Project Structure

```
gestione-spese-az/
├─ packages/
│  ├─ server/                 # Node + Fastify + Prisma
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/          # login, sessions, password hashing
│  │  │  │  ├─ users/         # users, roles, manager links
│  │  │  │  ├─ vehicles/
│  │  │  │  ├─ aci/           # AciRate, import batches, file parser
│  │  │  │  ├─ reports/       # ExpenseReport + state-machine endpoints
│  │  │  │  ├─ items/         # ExpenseItem, mileage calc
│  │  │  │  └─ payment/       # totals, CSV export
│  │  │  ├─ core/             # PURE domain logic, framework-free
│  │  │  │  ├─ stateMachine.ts        # allowed transitions + role guards
│  │  │  │  ├─ mileage.ts             # range, tolerance, km × rate
│  │  │  │  ├─ money.ts               # cent rounding, totals, VAT
│  │  │  │  └─ distanceProvider.ts    # PORT interface + fake impl
│  │  │  └─ app.ts
│  │  └─ prisma/schema.prisma
│  └─ web/                    # React + Vite + TS
│     └─ src/{pages,components,api,...}
└─ package.json (workspaces)
```

Key principle: **domain logic in `core/` is pure and framework-free** (no DB, no
HTTP). Fastify modules are thin wrappers that call into `core/`. This makes the
rules trivial to unit-test first.

## 13. Data Model (Prisma / PostgreSQL)

Money fields are integer cents. Rates are decimals (€/km).

- **User**: `id`, `email` (unique), `passwordHash`, `fullName`,
  `role` (`EMPLOYEE`|`MANAGER`|`FINANCE`|`ADMIN`), `managerId` (self-ref),
  `active`, timestamps.
- **Vehicle**: `id`, `userId`, `label`, `aciRateId`, `plate?`, `active`.
- **AciRate**: `id`, `year`, `make`, `model`, `fuel`, `variant`,
  `costPerKm` (decimal), `importBatchId`. Unique per (year, make, model, fuel,
  variant).
- **AciImportBatch**: `id`, `year`, `fileName`, `rowCount`, `importedById`,
  `importedAt`.
- **ExpenseReport**: `id`, `ownerId`, `title`, `state`, `submittedAt?`,
  `decidedAt?`, `decidedById?`, `paidAt?`, `paymentReference?`,
  `totalCents` (cached), timestamps.
- **ExpenseItem**: `id`, `reportId`, `category`, `date`, `description`,
  `amountCents`, `vatCents?`, `receiptRef?`, `notes?`.
  Mileage-only: `vehicleId?`, `originAddress?`, `destinationAddress?`,
  `roundTrip`, `baselineKm?`, `tolerancePercent?`, `enteredKm?`, `ratePerKm?`,
  `overageJustification?`, `routeProvider?`.
- **ReportEvent**: `id`, `reportId`, `actorId`, `fromState`, `toState`,
  `comment?`, `createdAt`.
- **Setting**: key/value store for the mileage `tolerancePercent` (and future
  config).

## 14. API Surface (REST, role-guarded)

- **Auth:** `POST /login`, `POST /logout`, `GET /me`.
- **Users & vehicles:** CRUD (Admin) under `/users`, `/users/:id/vehicles`.
- **ACI:** `POST /aci/import`, `GET /aci/rates?search=...&year=...`.
- **Reports:** CRUD under `/reports`; transitions:
  `POST /reports/:id/submit`, `/approve`, `/reject`, `/revise`,
  `/send-payment`, `/mark-paid`.
- **Items:** CRUD nested under `/reports/:id/items`.
- **Mileage helper:** `POST /items/mileage/quote` → `{ baselineKm, lowerBound,
  upperBound, tolerancePercent }`.
- **Payment export:** `GET /reports/export.csv?state=...`.

## 15. Testing Strategy (TDD)

1. **Unit (Vitest) on `core/`** — the bulk of the discipline; pure, fast, no I/O.
   - State machine: every legal transition, every illegal one rejected, role
     guards.
   - Mileage: baseline→range, tolerance, km × rate rounding, justification
     required when over, round-trip doubling.
   - Money: cent rounding, report total = sum of items, VAT.
   - `DistanceProvider`: exercised via the fake.
2. **Integration / API (Vitest + Supertest)** against a dedicated test Postgres
   DB, reset between tests: auth + role enforcement, full report flow through
   every transition, ACI import of a small sample file.
3. **E2E (Playwright)** — a few critical happy paths through the real UI:
   employee creates report with a mileage item → submits → manager approves →
   finance exports & marks paid. Kept thin.

Rule: write the failing test first, watch it fail, then write the minimum code to
pass. Domain rules get a unit test before implementation; endpoints get an API
test before the handler.

## 16. Explicitly Out of Scope (for now)

- OCR / receipt image parsing.
- Multi-tenancy (data isolation, billing, onboarding).
- Direct bank/payment provider integration.
- SSO / external identity.
- Line-level (per-item) manager approval.
- Waypoint / multi-stop mileage trips.
- Automatic ACI scraping / auto-fetch.
