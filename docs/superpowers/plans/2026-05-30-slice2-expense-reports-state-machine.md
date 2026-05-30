# Slice 2 — Expense Reports & State Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the core unit of work — the **expense report (nota spese)** — flowing through its approval state machine: an employee creates a report, adds money line items, submits it; the employee's manager approves, rejects, or sends it back for revision. Everything is enforced server-side by a pure, fully-tested state machine and surfaced through an entirely-Italian web UI.

**Architecture:** Builds directly on Slice 1 (Fastify + Prisma + PostgreSQL server, React + Vite web, `core/` pure-logic discipline). This slice introduces a third workspace package — **`@gsa/shared`** — that holds framework-free domain constants and the **pure state machine** consumed by *both* tiers (server enforces transitions; web decides which action buttons to show), eliminating duplicated `Role`/state vocabulary. The `ExpenseReport` aggregate (with `ExpenseItem` children and a `ReportEvent` audit trail) is driven by a thin report service that wraps each transition in a DB transaction and records an audit row. Mileage (`MILEAGE` category, vehicles, ACI rates, distance provider) is **out of scope** here — it is Slice 3; this slice supports only the money categories (`MEALS_LODGING`, `TRANSPORT`, `OTHER`). Payment transitions (`SENT_FOR_PAYMENT`, `PAID`) and CSV export are **Slice 4**; their transitions are defined in the pure state machine now (cheap, fully tested) but no HTTP endpoint or UI exposes them yet.

**This slice also folds in three carried-forward recommendations from the Slice 1 review:**
1. **Namespace the entire API under `/api/*`** — permanently fixes the Vite-proxy vs SPA-route `/login` collision.
2. **Harden login** — constant-time-ish dummy bcrypt compare on unknown email, plus a per-IP login rate limiter.
3. **Promote the duplicated `Role` type into a shared package** — now justified because a second and third shared type (`ReportState`, `Category`) appear.

**Tech Stack:** Node 24, TypeScript 5, Fastify 4, `@fastify/rate-limit` 9, Prisma 5, PostgreSQL, `zod`, Vitest, Supertest, React 18, Vite 5, `react-i18next`, `react-router-dom` 6, Playwright. New workspace package `@gsa/shared` (pure TS, built to `dist` via a `prepare` script).

---

## File Structure

```
gestione-spese-az/
├─ package.json                                  # MODIFY: add packages/shared to workspaces
├─ packages/
│  ├─ shared/                                     # NEW PACKAGE: @gsa/shared (pure domain)
│  │  ├─ package.json                             # exports dist; prepare = tsc build
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts                              # re-exports everything
│  │     ├─ roles.ts                              # MOVED from server core: ROLES, Role, hasAtLeast, canManageUsers
│  │     └─ reports.ts                            # ReportState, Category, state-machine table + pure helpers
│  ├─ server/
│  │  ├─ package.json                             # MODIFY: add @gsa/shared, @fastify/rate-limit
│  │  ├─ prisma/schema.prisma                     # MODIFY: ReportState/Category enums, ExpenseReport/ExpenseItem/ReportEvent
│  │  ├─ prisma/migrations/<ts>_expense_reports/  # NEW migration
│  │  └─ src/
│  │     ├─ core/roles.ts                         # MODIFY: re-export from @gsa/shared (keeps existing imports working)
│  │     ├─ core/stateMachine.test.ts             # NEW: TDD for @gsa/shared state machine
│  │     ├─ core/money.ts                         # NEW: sumCents (pure)
│  │     ├─ core/money.test.ts                    # NEW
│  │     ├─ auth/password.ts                      # MODIFY: export DUMMY_HASH
│  │     ├─ auth/auth.routes.ts                   # MODIFY: dummy-hash timing + rate-limit on /login
│  │     ├─ app.ts                                # MODIFY: /api prefix, rate-limit plugin, report/item routes, buildApp opts
│  │     ├─ reports/reports.schemas.ts            # NEW
│  │     ├─ reports/reports.service.ts            # NEW: transition + total recompute (transactional + audit)
│  │     ├─ reports/reports.routes.ts             # NEW: CRUD + transitions
│  │     ├─ items/items.schemas.ts                # NEW
│  │     ├─ items/items.routes.ts                 # NEW: nested item CRUD
│  │     └─ scripts/seedDev.ts                    # NEW: idempotent dev seed (admin+manager+employee) for E2E/manual
│  │  └─ test/
│  │     ├─ helpers.ts                            # MODIFY: resetDb order, seedReport/seedItem, high rate-limit
│  │     ├─ auth.api.test.ts                      # MODIFY: /api paths + rate-limit test
│  │     ├─ users.api.test.ts                     # MODIFY: /api paths
│  │     └─ reports.api.test.ts                   # NEW: full lifecycle + guards
│  └─ web/
│     ├─ package.json                             # MODIFY: add @gsa/shared
│     ├─ vite.config.ts                           # MODIFY: proxy only /api
│     ├─ src/
│     │  ├─ i18n.ts                               # MODIFY: states, categories, reports/items strings, nav
│     │  ├─ api/client.ts                         # MODIFY: API_BASE=/api, Role from shared, report/item types+calls
│     │  ├─ App.tsx                               # MODIFY: routes + nav
│     │  ├─ components/NavBar.tsx                 # NEW: role-aware Italian nav
│     │  ├─ pages/ReportsPage.tsx                 # NEW: own reports list + create
│     │  ├─ pages/ReportDetailPage.tsx            # NEW: items + submit + manager actions
│     │  └─ pages/ApprovalsPage.tsx               # NEW: manager approval queue
│     └─ e2e/reports.spec.ts                      # NEW: employee create→submit, manager approve
└─ docs/superpowers/plans/2026-05-30-slice2-expense-reports-state-machine.md
```

Responsibility split: `@gsa/shared` owns the domain vocabulary and the **pure** transition table (single source of truth for both tiers). `reports.service.ts` owns orchestration (load → authorize via state machine → mutate + audit in one transaction → recompute total). Routes stay thin. Web pages are role-aware but never the source of authorization truth.

---

## Roadmap reminder (4 slices)

- **Slice 1 — Foundation, Auth & Users** ✅ (merged).
- **Slice 2 — Expense Reports & State Machine** ← *this plan* (money items only; approval workflow).
- **Slice 3 — ACI Rates, Vehicles & Mileage** (adds `MILEAGE` items, `Vehicle`/`AciRate` models, `DistanceProvider` port, mileage validation; extends `ExpenseItem` with mileage columns).
- **Slice 4 — Payment & Export** (wires the already-defined `send-payment`/`mark-paid` transitions to Finance endpoints + UI, CSV export).

---

## Task 1: Create `@gsa/shared` package and move the `Role` type into it

**Files:**
- Modify: `package.json` (root)
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/roles.ts`
- Create: `packages/shared/src/reports.ts`
- Create: `packages/shared/src/index.ts`
- Modify: `packages/server/src/core/roles.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Add the new package to the root workspaces array**

In root `package.json`, change the `workspaces` array to include `shared` **first** (so `npm install` builds it before dependents):

```json
  "workspaces": [
    "packages/shared",
    "packages/server",
    "packages/web"
  ],
```

- [ ] **Step 2: Create `packages/shared/package.json`**

```json
{
  "name": "@gsa/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepare": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.5.3"
  }
}
```

> The `prepare` script makes `npm install` build `dist/` automatically, so `tsx` (server dev), Vitest, Vite, and `tsc` all resolve the built JS + `.d.ts` without a manual pre-build. When editing shared sources during development, re-run `npm run build --workspace packages/shared`.

- [ ] **Step 3: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/shared/src/roles.ts` (moved verbatim from the server core)**

```ts
export const ROLES = ["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Higher index = more privilege. FINANCE and ADMIN both manage payment;
// ADMIN additionally manages users and configuration.
const RANK: Record<Role, number> = {
  EMPLOYEE: 0,
  MANAGER: 1,
  FINANCE: 2,
  ADMIN: 3,
};

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}
```

- [ ] **Step 5: Create `packages/shared/src/reports.ts` (enums only for now; state machine added in Task 2)**

```ts
export const REPORT_STATES = [
  "CREATED",
  "READY_FOR_APPROVAL",
  "IN_REVISION",
  "APPROVED",
  "REJECTED",
  "SENT_FOR_PAYMENT",
  "PAID",
] as const;
export type ReportState = (typeof REPORT_STATES)[number];

// Full domain vocabulary. MILEAGE is modelled now but only accepted by the API
// starting in Slice 3; this slice accepts the money categories only.
export const CATEGORIES = ["MILEAGE", "MEALS_LODGING", "TRANSPORT", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MONEY_CATEGORIES = ["MEALS_LODGING", "TRANSPORT", "OTHER"] as const;
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```ts
export * from "./roles.js";
export * from "./reports.js";
```

- [ ] **Step 7: Re-point the server core to the shared package (keeps all existing imports working)**

Replace the entire contents of `packages/server/src/core/roles.ts` with:

```ts
// Role logic now lives in @gsa/shared so the web app can share it. This module
// re-exports it so existing imports (../core/roles.js) keep working unchanged.
export { ROLES, hasAtLeast, canManageUsers, type Role } from "@gsa/shared";
```

- [ ] **Step 8: Add `@gsa/shared` as a dependency of server and web**

In `packages/server/package.json` `dependencies`, add:
```json
    "@gsa/shared": "*",
```
In `packages/web/package.json` `dependencies`, add:
```json
    "@gsa/shared": "*",
```

- [ ] **Step 9: De-duplicate the web `Role` type**

In `packages/web/src/api/client.ts`, replace the line `export type Role = "EMPLOYEE" | "MANAGER" | "FINANCE" | "ADMIN";` with:

```ts
import type { Role } from "@gsa/shared";
export type { Role };
```

(Place the `import` at the top of the file with the other imports; keep the `export type { Role }` so existing `import { type Role } from "../api/client.js"` call sites in `UsersPage.tsx` keep working.)

- [ ] **Step 10: Install, build shared, and verify everything still compiles & passes**

Run:
```bash
npm install
npm run build --workspace packages/shared
npm run build --workspace packages/server
npm test --workspace packages/server
npm test --workspace packages/web
```
Expected: install links `@gsa/shared` and runs its `prepare` build; server builds; server's existing `roles.test.ts` still PASSES (3 tests) through the re-export; web tests still PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json packages/shared packages/server/package.json packages/server/src/core/roles.ts packages/web/package.json packages/web/src/api/client.ts
git commit -m "refactor: introduce @gsa/shared package and move Role into it"
```

---

## Task 2: Pure state machine in `@gsa/shared` (TDD)

The transition table is the single source of truth for **both** tiers. It is pure (no DB, no role-relationship knowledge): it maps `(fromState, action) → { toState, requiredActor }`. The *relationship* check (is this requester the owner's manager?) is resolved later in the server service against DB data.

**Files:**
- Modify: `packages/shared/src/reports.ts`
- Test: `packages/server/src/core/stateMachine.test.ts`

- [ ] **Step 1: Write the failing test (run by the server's Vitest, importing from `@gsa/shared`)**

```ts
// packages/server/src/core/stateMachine.test.ts
import { describe, it, expect } from "vitest";
import {
  findTransition,
  actionsFor,
  isEditableState,
  type ReportAction,
} from "@gsa/shared";

describe("state machine", () => {
  it("maps submit from CREATED and IN_REVISION to READY_FOR_APPROVAL (owner)", () => {
    const a = findTransition("CREATED", "submit");
    expect(a).toMatchObject({ to: "READY_FOR_APPROVAL", actor: "OWNER" });
    const b = findTransition("IN_REVISION", "submit");
    expect(b).toMatchObject({ to: "READY_FOR_APPROVAL", actor: "OWNER" });
  });

  it("maps the manager decisions from READY_FOR_APPROVAL", () => {
    expect(findTransition("READY_FOR_APPROVAL", "approve")).toMatchObject({
      to: "APPROVED",
      actor: "MANAGER",
    });
    expect(findTransition("READY_FOR_APPROVAL", "reject")).toMatchObject({
      to: "REJECTED",
      actor: "MANAGER",
    });
    expect(findTransition("READY_FOR_APPROVAL", "revise")).toMatchObject({
      to: "IN_REVISION",
      actor: "MANAGER",
    });
  });

  it("defines the finance payment transitions (exposed via API in Slice 4)", () => {
    expect(findTransition("APPROVED", "send-payment")).toMatchObject({
      to: "SENT_FOR_PAYMENT",
      actor: "FINANCE",
    });
    expect(findTransition("SENT_FOR_PAYMENT", "mark-paid")).toMatchObject({
      to: "PAID",
      actor: "FINANCE",
    });
  });

  it("rejects illegal transitions", () => {
    expect(findTransition("CREATED", "approve")).toBeUndefined();
    expect(findTransition("APPROVED", "submit")).toBeUndefined();
    expect(findTransition("REJECTED", "approve")).toBeUndefined();
    expect(findTransition("PAID", "mark-paid")).toBeUndefined();
  });

  it("lists available actions for a state (for the UI)", () => {
    expect(actionsFor("READY_FOR_APPROVAL").sort()).toEqual(
      (["approve", "reject", "revise"] as ReportAction[]).sort(),
    );
    expect(actionsFor("CREATED")).toEqual(["submit"]);
    expect(actionsFor("PAID")).toEqual([]);
  });

  it("knows which states are employee-editable (on-hold phase)", () => {
    expect(isEditableState("CREATED")).toBe(true);
    expect(isEditableState("READY_FOR_APPROVAL")).toBe(true);
    expect(isEditableState("IN_REVISION")).toBe(true);
    expect(isEditableState("APPROVED")).toBe(false);
    expect(isEditableState("REJECTED")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/server -- src/core/stateMachine.test.ts`
Expected: FAIL — `findTransition`, `actionsFor`, `isEditableState` are not exported from `@gsa/shared`.

- [ ] **Step 3: Append the state machine to `packages/shared/src/reports.ts`**

Add below the existing enums:

```ts
export type ReportAction =
  | "submit"
  | "approve"
  | "reject"
  | "revise"
  | "send-payment"
  | "mark-paid";

// Which kind of actor a transition requires. The relationship behind MANAGER
// (is the requester the report owner's manager?) is resolved server-side; a
// FINANCE/ADMIN user always satisfies MANAGER as an override (see service).
export type ActorKind = "OWNER" | "MANAGER" | "FINANCE";

export interface TransitionDef {
  action: ReportAction;
  from: ReportState;
  to: ReportState;
  actor: ActorKind;
}

export const TRANSITIONS: readonly TransitionDef[] = [
  { action: "submit", from: "CREATED", to: "READY_FOR_APPROVAL", actor: "OWNER" },
  { action: "submit", from: "IN_REVISION", to: "READY_FOR_APPROVAL", actor: "OWNER" },
  { action: "approve", from: "READY_FOR_APPROVAL", to: "APPROVED", actor: "MANAGER" },
  { action: "reject", from: "READY_FOR_APPROVAL", to: "REJECTED", actor: "MANAGER" },
  { action: "revise", from: "READY_FOR_APPROVAL", to: "IN_REVISION", actor: "MANAGER" },
  { action: "send-payment", from: "APPROVED", to: "SENT_FOR_PAYMENT", actor: "FINANCE" },
  { action: "mark-paid", from: "SENT_FOR_PAYMENT", to: "PAID", actor: "FINANCE" },
] as const;

export function findTransition(
  from: ReportState,
  action: ReportAction,
): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function actionsFor(from: ReportState): ReportAction[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.action);
}

const EDITABLE_STATES: readonly ReportState[] = [
  "CREATED",
  "READY_FOR_APPROVAL",
  "IN_REVISION",
];

// Employee may edit the report and its items only before a manager decision.
export function isEditableState(state: ReportState): boolean {
  return EDITABLE_STATES.includes(state);
}
```

- [ ] **Step 4: Rebuild shared, then run the test to verify it passes**

Run:
```bash
npm run build --workspace packages/shared
npm test --workspace packages/server -- src/core/stateMachine.test.ts
```
Expected: PASS (6 tests). (The shared rebuild is required because the server consumes `@gsa/shared/dist`.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/reports.ts packages/server/src/core/stateMachine.test.ts
git commit -m "feat(shared): pure expense-report state machine"
```

---

## Task 3: Namespace the entire API under `/api/*`

Fixes the Vite-proxy vs SPA-route collision permanently: the dev proxy now matches only `/api`, so client-side routes like `/login` are always served by the React app.

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/server/test/auth.api.test.ts`
- Modify: `packages/server/test/users.api.test.ts`
- Modify: `packages/web/e2e/login.spec.ts` (comment only)

- [ ] **Step 1: Prefix the route registrations in `app.ts`**

Replace the registration block in `packages/server/src/app.ts` (the body that currently registers `authRoutes`, `userRoutes`, and `/health`) with:

```ts
  await app.register(sessionPlugin);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(userRoutes, { prefix: "/users" });
    },
    { prefix: "/api" },
  );

  // Infrastructure health check stays at the root (not part of the JSON API).
  app.get("/health", async () => ({ status: "ok" }));
```

(Keep the existing `import` lines and the `Fastify({ logger: false })` construction; only the registration block changes. Report and item routes are added to this `/api` group in Task 11.)

- [ ] **Step 2: Add the API base prefix in the web client**

In `packages/web/src/api/client.ts`, add a base constant and apply it in `request`:

```ts
const API_BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  // ...unchanged below...
```

(Call sites such as `api.post("/login", ...)`, `api.get("/me")`, `api.get("/users")` stay as-is — the prefix is applied centrally.)

- [ ] **Step 3: Simplify the Vite proxy to a single `/api` rule**

Replace the `proxy` object in `packages/web/vite.config.ts` with:

```ts
    proxy: {
      "/api": "http://localhost:3001",
    },
```

- [ ] **Step 4: Update the server API tests to the new paths**

In `packages/server/test/auth.api.test.ts`, change every request path: `/login` → `/api/login`, `/logout` → `/api/logout`, `/me` → `/api/me`.
In `packages/server/test/users.api.test.ts`, change `/login` → `/api/login` and `/users` (and `/users/:id`) → `/api/users` / `/api/users/${id}`.

- [ ] **Step 5: Update the now-obsolete comment in the E2E login spec**

In `packages/web/e2e/login.spec.ts`, replace the multi-line comment above `await page.goto("/")` with:

```ts
  // The API lives under /api, so the SPA route "/login" no longer collides with
  // the dev proxy. We still enter via "/" to exercise the unauthenticated
  // redirect, which is the real user entry point.
```

- [ ] **Step 6: Verify the full server suite and the web build**

Run:
```bash
npm test --workspace packages/server
npm run build --workspace packages/web
```
Expected: all server tests PASS against `/api/*`; web type-checks/builds.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/app.ts packages/web/src/api/client.ts packages/web/vite.config.ts packages/server/test/auth.api.test.ts packages/server/test/users.api.test.ts packages/web/e2e/login.spec.ts
git commit -m "refactor: namespace HTTP API under /api"
```

---

## Task 4: Harden login — dummy bcrypt timing + rate limiter

**Files:**
- Modify: `packages/server/package.json` (add `@fastify/rate-limit`)
- Modify: `packages/server/src/auth/password.ts` (export a dummy hash)
- Modify: `packages/server/src/app.ts` (register rate-limit plugin; accept `buildApp` options)
- Modify: `packages/server/src/auth/auth.routes.ts` (constant-time compare + per-route rate limit)

- [ ] **Step 1: Add the rate-limit dependency**

In `packages/server/package.json` `dependencies`, add:
```json
    "@fastify/rate-limit": "^9.1.0",
```
Then run: `npm install`
Expected: installs `@fastify/rate-limit`.

- [ ] **Step 2: Export a precomputed dummy hash from `password.ts`**

Append to `packages/server/src/auth/password.ts`:

```ts
// A valid bcrypt hash used to equalize login timing when the email is unknown,
// so an attacker cannot distinguish "no such user" from "wrong password" by
// response time. The plaintext is irrelevant; it must never match a real input.
export const DUMMY_HASH = bcrypt.hashSync("invalid-credentials-placeholder", SALT_ROUNDS);
```

(`bcrypt` and `SALT_ROUNDS` are already imported/defined at the top of the file.)

- [ ] **Step 3: Make `buildApp` accept options and register the rate-limit plugin**

In `packages/server/src/app.ts`:

- Change the imports/signature:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { sessionPlugin } from "./plugins/session.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/users.routes.js";

export interface BuildAppOptions {
  // Max login attempts per IP per minute. Low in production; tests override high.
  loginRateMax?: number;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const loginRateMax = opts.loginRateMax ?? Number(process.env.LOGIN_RATE_MAX ?? 5);

  const app = Fastify({ logger: false });

  // Registered globally:false so it only applies to routes that opt in via
  // config.rateLimit (the login route).
  await app.register(rateLimit, { global: false });

  await app.register(sessionPlugin);

  await app.register(
    async (api) => {
      await api.register(authRoutes, { loginRateMax });
      await api.register(userRoutes, { prefix: "/users" });
    },
    { prefix: "/api" },
  );

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

- [ ] **Step 4: Update the server entrypoint to pass no options (uses env default)**

No change needed to `server.ts` — `buildApp()` with no args reads `LOGIN_RATE_MAX` from env (default 5). Confirm `server.ts` still calls `await buildApp()`.

- [ ] **Step 5: Apply constant-time compare + rate limit in `auth.routes.ts`**

Replace the contents of `packages/server/src/auth/auth.routes.ts` with:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword, DUMMY_HASH } from "./password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface AuthRoutesOptions {
  loginRateMax: number;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: AuthRoutesOptions,
): Promise<void> {
  app.post(
    "/login",
    {
      config: {
        rateLimit: { max: opts.loginRateMax, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      // Always run a bcrypt comparison (against a dummy hash when the user is
      // unknown) so the response time does not reveal whether the email exists.
      const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

      if (!user || !user.active || !passwordOk) {
        return reply.code(401).send({ error: "CREDENZIALI_NON_VALIDE" });
      }

      req.session.set("user", { id: user.id, role: user.role });
      return reply.send({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
    },
  );

  app.post("/logout", async (req, reply) => {
    req.session.delete();
    return reply.send({ ok: true });
  });

  app.get("/me", { preHandler: app.requireAuth }, async (req, reply) => {
    const sessionUser = req.currentUser!;
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.active) {
      req.session.delete();
      return reply.code(401).send({ error: "NON_AUTENTICATO" });
    }
    return reply.send({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  });
}
```

- [ ] **Step 6: Verify the server builds (rate-limit test added in Task 7's harness update)**

Run: `npm run build --workspace packages/server`
Expected: compiles. (Existing auth tests still pass; a dedicated 429 test is added once the harness lets us build an app with a low `loginRateMax` — see Task 7 Step 4.)

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json package-lock.json packages/server/src/auth/password.ts packages/server/src/app.ts packages/server/src/auth/auth.routes.ts
git commit -m "feat(auth): constant-time login compare and login rate limiter"
```

---

## Task 5: Money core helper (TDD)

**Files:**
- Create: `packages/server/src/core/money.ts`
- Test: `packages/server/src/core/money.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/core/money.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/server -- src/core/money.test.ts`
Expected: FAIL — cannot resolve `./money.js`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// packages/server/src/core/money.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/server -- src/core/money.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/money.ts packages/server/src/core/money.test.ts
git commit -m "feat(core): sumCents money helper"
```

---

## Task 6: Prisma models for reports, items, and audit events + migration

**Files:**
- Modify: `packages/server/prisma/schema.prisma`

- [ ] **Step 1: Add the enums and models to `schema.prisma`**

Append the following to `packages/server/prisma/schema.prisma` (after the existing `User` model), and add the two back-relation fields to `User` as shown:

```prisma
enum ReportState {
  CREATED
  READY_FOR_APPROVAL
  IN_REVISION
  APPROVED
  REJECTED
  SENT_FOR_PAYMENT
  PAID
}

enum Category {
  MILEAGE
  MEALS_LODGING
  TRANSPORT
  OTHER
}

model ExpenseReport {
  id               String        @id @default(cuid())
  ownerId          String
  owner            User          @relation("OwnedReports", fields: [ownerId], references: [id])
  title            String
  state            ReportState   @default(CREATED)
  submittedAt      DateTime?
  decidedAt        DateTime?
  decidedById      String?
  decidedBy        User?         @relation("DecidedReports", fields: [decidedById], references: [id])
  paidAt           DateTime?
  paymentReference String?
  totalCents       Int           @default(0)
  items            ExpenseItem[]
  events           ReportEvent[]
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
}

model ExpenseItem {
  id          String        @id @default(cuid())
  reportId    String
  report      ExpenseReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  category    Category
  date        DateTime
  description String
  amountCents Int
  vatCents    Int?
  receiptRef  String?
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  // Mileage-only columns (vehicleId, baselineKm, enteredKm, ratePerKm, ...) are
  // added in Slice 3 when the MILEAGE category becomes supported.
}

model ReportEvent {
  id        String        @id @default(cuid())
  reportId  String
  report    ExpenseReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  actorId   String
  actor     User          @relation("ReportEvents", fields: [actorId], references: [id])
  fromState ReportState
  toState   ReportState
  comment   String?
  createdAt DateTime      @default(now())
}
```

Add these three back-relation fields inside the existing `model User { ... }` block (alongside `reports User[] @relation("Reports")`):

```prisma
  ownedReports   ExpenseReport[] @relation("OwnedReports")
  decidedReports ExpenseReport[] @relation("DecidedReports")
  reportEvents   ReportEvent[]   @relation("ReportEvents")
```

- [ ] **Step 2: Create the migration against the dev DB**

Run:
```bash
npm run prisma:migrate --workspace packages/server -- --name expense_reports
```
Expected: creates `packages/server/prisma/migrations/<timestamp>_expense_reports/` and regenerates the Prisma client. The `expense_report`, `expense_item`, and `report_event` tables now exist in `gestione_spese`.

- [ ] **Step 3: Apply the migration to the TEST database**

Run (PowerShell, from `packages/server`):
```powershell
$env:DATABASE_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy
```
(Bash equivalent: `cd packages/server && DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy && cd ../..`)
Expected: "All migrations have been successfully applied" against `gestione_spese_test`.

> If `$env:TEST_DATABASE_URL` is empty in your shell, load it first from `packages/server/.env` (the dev/test DB URLs live there). The values are `gestione_spese` / `gestione_spese_test` on localhost.

- [ ] **Step 4: Commit**

```bash
git add packages/server/prisma/schema.prisma packages/server/prisma/migrations
git commit -m "feat(db): ExpenseReport, ExpenseItem and ReportEvent models"
```

---

## Task 7: Extend the integration-test harness

**Files:**
- Modify: `packages/server/test/helpers.ts`
- Test: `packages/server/test/auth.api.test.ts` (add the rate-limit case)

- [ ] **Step 1: Set a high login rate limit for the suite and fix the reset order**

In `packages/server/test/helpers.ts`, add the rate-limit env override next to the existing env setup (before the dynamic `import` of `../src/db.js`):

```ts
// Keep the login rate limiter effectively disabled for the suite; a dedicated
// test builds its own app with a low limit to verify 429 behaviour.
process.env.LOGIN_RATE_MAX = process.env.LOGIN_RATE_MAX ?? "100000";
```

Replace `resetDb` with an FK-safe ordering that clears the new tables first:

```ts
export async function resetDb(): Promise<void> {
  // Children before parents to satisfy foreign keys.
  await prisma.reportEvent.deleteMany({});
  await prisma.expenseItem.deleteMany({});
  await prisma.expenseReport.deleteMany({});
  await prisma.user.deleteMany({});
}
```

- [ ] **Step 2: Add report/item seed helpers**

Append to `packages/server/test/helpers.ts`:

```ts
import type { ReportState, Category } from "@gsa/shared";

export async function seedReport(opts: {
  ownerId: string;
  title?: string;
  state?: ReportState;
}): Promise<{ id: string }> {
  const report = await prisma.expenseReport.create({
    data: {
      ownerId: opts.ownerId,
      title: opts.title ?? "Trasferta",
      state: opts.state ?? "CREATED",
    },
  });
  return { id: report.id };
}

export async function seedItem(opts: {
  reportId: string;
  category?: Category;
  description?: string;
  amountCents?: number;
}): Promise<{ id: string }> {
  const item = await prisma.expenseItem.create({
    data: {
      reportId: opts.reportId,
      category: opts.category ?? "TRANSPORT",
      date: new Date("2026-05-20T00:00:00.000Z"),
      description: opts.description ?? "Treno",
      amountCents: opts.amountCents ?? 2500,
    },
  });
  return { id: item.id };
}
```

(Place the `import type` line with the other imports at the top of the file.)

- [ ] **Step 3: Verify the harness still loads (existing tests pass)**

Run: `npm test --workspace packages/server`
Expected: all existing tests PASS with the new reset order.

- [ ] **Step 4: Add a rate-limit test to `auth.api.test.ts`**

Add this test inside the `describe("auth", ...)` block in `packages/server/test/auth.api.test.ts`. It builds its **own** app with a low limit so it does not depend on the suite-wide high limit:

```ts
  it("rate-limits repeated login attempts with 429", async () => {
    const { buildApp } = await import("../src/app.js");
    const limited = await buildApp({ loginRateMax: 3 });
    await limited.ready();
    try {
      const attempt = () =>
        request(limited.server)
          .post("/api/login")
          .send({ email: "admin@example.com", password: "wrong" });
      // First 3 are allowed (401 wrong creds); the 4th is blocked (429).
      await attempt();
      await attempt();
      await attempt();
      const fourth = await attempt();
      expect(fourth.status).toBe(429);
    } finally {
      await limited.close();
    }
  });
```

- [ ] **Step 5: Run the auth tests**

Run: `npm test --workspace packages/server -- test/auth.api.test.ts`
Expected: PASS (6 tests, including the new 429 case).

- [ ] **Step 6: Commit**

```bash
git add packages/server/test/helpers.ts packages/server/test/auth.api.test.ts
git commit -m "test(server): report/item seed helpers and login rate-limit coverage"
```

---

## Task 8: Report request schemas and transition service

**Files:**
- Create: `packages/server/src/reports/reports.schemas.ts`
- Create: `packages/server/src/reports/reports.service.ts`

- [ ] **Step 1: Create the request schemas**

```ts
// packages/server/src/reports/reports.schemas.ts
import { z } from "zod";

export const createReportSchema = z.object({
  title: z.string().min(1),
});

export const updateReportSchema = z.object({
  title: z.string().min(1),
});

// Body for the "revise" transition (the manager's revision reason).
export const reviseSchema = z.object({
  comment: z.string().min(1),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
```

- [ ] **Step 2: Create the transition + total-recompute service**

```ts
// packages/server/src/reports/reports.service.ts
import { prisma } from "../db.js";
import { sumCents } from "../core/money.js";
import {
  findTransition,
  hasAtLeast,
  type ReportAction,
  type ActorKind,
  type Role,
} from "@gsa/shared";

export type TransitionErrorCode = "TRANSIZIONE_NON_VALIDA" | "NON_AUTORIZZATO";

export class TransitionError extends Error {
  constructor(public code: TransitionErrorCode) {
    super(code);
  }
}

export interface Actor {
  id: string;
  role: Role;
}

// Resolve the pure ActorKind requirement against concrete request data.
// FINANCE/ADMIN satisfy MANAGER as an override (spec §5).
function actorSatisfies(
  required: ActorKind,
  actor: Actor,
  ownerId: string,
  ownerManagerId: string | null,
): boolean {
  switch (required) {
    case "OWNER":
      return actor.id === ownerId;
    case "MANAGER":
      return actor.id === ownerManagerId || hasAtLeast(actor.role, "FINANCE");
    case "FINANCE":
      return hasAtLeast(actor.role, "FINANCE");
  }
}

// Recompute and persist the cached report total from its current items.
export async function recomputeTotal(reportId: string): Promise<void> {
  const items = await prisma.expenseItem.findMany({
    where: { reportId },
    select: { amountCents: true },
  });
  const totalCents = sumCents(items.map((i) => i.amountCents));
  await prisma.expenseReport.update({ where: { id: reportId }, data: { totalCents } });
}

// Returns the updated report, or null if the report does not exist (→ 404).
// Throws TransitionError for illegal transitions or unauthorized actors.
export async function performTransition(
  reportId: string,
  action: ReportAction,
  actor: Actor,
  comment?: string,
) {
  const report = await prisma.expenseReport.findUnique({
    where: { id: reportId },
    include: { owner: { select: { managerId: true } } },
  });
  if (!report) return null;

  const def = findTransition(report.state, action);
  if (!def) throw new TransitionError("TRANSIZIONE_NON_VALIDA");

  if (!actorSatisfies(def.actor, actor, report.ownerId, report.owner.managerId)) {
    throw new TransitionError("NON_AUTORIZZATO");
  }

  if (action === "revise" && !comment) {
    throw new TransitionError("TRANSIZIONE_NON_VALIDA");
  }

  const isDecision = action === "approve" || action === "reject";

  return prisma.$transaction(async (tx) => {
    const updated = await tx.expenseReport.update({
      where: { id: reportId },
      data: {
        state: def.to,
        ...(action === "submit" ? { submittedAt: new Date() } : {}),
        ...(isDecision ? { decidedAt: new Date(), decidedById: actor.id } : {}),
      },
    });
    await tx.reportEvent.create({
      data: {
        reportId,
        actorId: actor.id,
        fromState: def.from,
        toState: def.to,
        comment: comment ?? null,
      },
    });
    return updated;
  });
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build --workspace packages/server`
Expected: compiles (no routes call it yet; behaviour is verified by the API tests in Task 12).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/reports/reports.schemas.ts packages/server/src/reports/reports.service.ts
git commit -m "feat(reports): request schemas and transactional transition service"
```

---

## Task 9: Report CRUD routes

**Files:**
- Create: `packages/server/src/reports/reports.routes.ts`

- [ ] **Step 1: Create the report routes (CRUD + ownership/visibility guards)**

```ts
// packages/server/src/reports/reports.routes.ts
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hasAtLeast, isEditableState } from "@gsa/shared";
import { createReportSchema, updateReportSchema } from "./reports.schemas.js";

const reportSelect = {
  id: true,
  ownerId: true,
  title: true,
  state: true,
  totalCents: true,
  submittedAt: true,
  decidedAt: true,
  createdAt: true,
} satisfies Prisma.ExpenseReportSelect;

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // List. ?scope=approvals → reports awaiting the caller as manager.
  app.get<{ Querystring: { scope?: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req) => {
      const me = req.currentUser!;
      if (req.query.scope === "approvals") {
        return prisma.expenseReport.findMany({
          where: {
            state: "READY_FOR_APPROVAL",
            owner: hasAtLeast(me.role, "FINANCE") ? undefined : { managerId: me.id },
          },
          select: reportSelect,
          orderBy: { submittedAt: "asc" },
        });
      }
      return prisma.expenseReport.findMany({
        where: { ownerId: me.id },
        select: reportSelect,
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post("/", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;
    const report = await prisma.expenseReport.create({
      data: { ownerId: me.id, title: parsed.data.title },
      select: reportSelect,
    });
    return reply.code(201).send(report);
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({
        where: { id: req.params.id },
        select: {
          ...reportSelect,
          owner: { select: { id: true, fullName: true, managerId: true } },
          items: {
            select: {
              id: true,
              category: true,
              date: true,
              description: true,
              amountCents: true,
              vatCents: true,
              notes: true,
            },
            orderBy: { date: "asc" },
          },
          events: {
            select: { fromState: true, toState: true, comment: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });

      const canView =
        report.ownerId === me.id ||
        report.owner.managerId === me.id ||
        hasAtLeast(me.role, "FINANCE");
      if (!canView) return reply.code(403).send({ error: "NON_AUTORIZZATO" });

      return report;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateReportSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      if (report.ownerId !== me.id) return reply.code(403).send({ error: "NON_AUTORIZZATO" });
      if (!isEditableState(report.state)) {
        return reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
      }
      const updated = await prisma.expenseReport.update({
        where: { id: req.params.id },
        data: { title: parsed.data.title },
        select: reportSelect,
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      if (report.ownerId !== me.id) return reply.code(403).send({ error: "NON_AUTORIZZATO" });
      // Only an untouched draft may be deleted.
      if (report.state !== "CREATED") {
        return reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
      }
      await prisma.expenseReport.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build --workspace packages/server`
Expected: compiles. (Routes are wired into the app in Task 11; tested in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/reports/reports.routes.ts
git commit -m "feat(reports): report CRUD routes with ownership and visibility guards"
```

---

## Task 10: Nested item routes (money categories only)

**Files:**
- Create: `packages/server/src/items/items.schemas.ts`
- Create: `packages/server/src/items/items.routes.ts`

- [ ] **Step 1: Create the item schemas (money categories only this slice)**

```ts
// packages/server/src/items/items.schemas.ts
import { z } from "zod";
import { MONEY_CATEGORIES } from "@gsa/shared";

// MILEAGE is intentionally excluded until Slice 3 (needs vehicle + ACI rate +
// distance provider). Sending MILEAGE here yields DATI_NON_VALIDI.
export const createItemSchema = z.object({
  category: z.enum(MONEY_CATEGORIES),
  date: z.coerce.date(),
  description: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  vatCents: z.number().int().nonnegative().nullish(),
  receiptRef: z.string().min(1).nullish(),
  notes: z.string().min(1).nullish(),
});

export const updateItemSchema = createItemSchema.partial();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
```

- [ ] **Step 2: Create the nested item routes**

```ts
// packages/server/src/items/items.routes.ts
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { isEditableState } from "@gsa/shared";
import { recomputeTotal } from "../reports/reports.service.js";
import { createItemSchema, updateItemSchema } from "./items.schemas.js";

const itemSelect = {
  id: true,
  category: true,
  date: true,
  description: true,
  amountCents: true,
  vatCents: true,
  receiptRef: true,
  notes: true,
} satisfies Prisma.ExpenseItemSelect;

// Loads the parent report and enforces: it exists, the caller owns it, and it
// is in an employee-editable state. Returns the report id or sends the error.
async function requireEditableOwnReport(
  req: Parameters<Parameters<FastifyInstance["get"]>[2]>[0],
  reply: Parameters<Parameters<FastifyInstance["get"]>[2]>[1],
  reportId: string,
): Promise<string | null> {
  const me = req.currentUser!;
  const report = await prisma.expenseReport.findUnique({ where: { id: reportId } });
  if (!report) {
    await reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
    return null;
  }
  if (report.ownerId !== me.id) {
    await reply.code(403).send({ error: "NON_AUTORIZZATO" });
    return null;
  }
  if (!isEditableState(report.state)) {
    await reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
    return null;
  }
  return report.id;
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/reports/:reportId/items".
  app.post<{ Params: { reportId: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const item = await prisma.expenseItem.create({
        data: { reportId, ...parsed.data },
        select: itemSelect,
      });
      await recomputeTotal(reportId);
      return reply.code(201).send(item);
    },
  );

  app.patch<{ Params: { reportId: string; itemId: string } }>(
    "/:itemId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const existing = await prisma.expenseItem.findFirst({
        where: { id: req.params.itemId, reportId },
      });
      if (!existing) return reply.code(404).send({ error: "VOCE_NON_TROVATA" });

      const item = await prisma.expenseItem.update({
        where: { id: req.params.itemId },
        data: parsed.data,
        select: itemSelect,
      });
      await recomputeTotal(reportId);
      return item;
    },
  );

  app.delete<{ Params: { reportId: string; itemId: string } }>(
    "/:itemId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const existing = await prisma.expenseItem.findFirst({
        where: { id: req.params.itemId, reportId },
      });
      if (!existing) return reply.code(404).send({ error: "VOCE_NON_TROVATA" });

      await prisma.expenseItem.delete({ where: { id: req.params.itemId } });
      await recomputeTotal(reportId);
      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build --workspace packages/server`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/items/items.schemas.ts packages/server/src/items/items.routes.ts
git commit -m "feat(items): nested expense-item CRUD with total recompute"
```

---

## Task 11: Transition routes and app wiring

**Files:**
- Modify: `packages/server/src/reports/reports.routes.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Add the four transition endpoints to `reports.routes.ts`**

Add the following helper and endpoints inside `reportRoutes`, after the `delete` handler (still within the function body). Add the import at the top of the file:

```ts
import { performTransition, TransitionError } from "./reports.service.js";
import { reviseSchema } from "./reports.schemas.js";
import type { ReportAction } from "@gsa/shared";
```

```ts
  async function runTransition(
    req: { currentUser?: { id: string; role: import("@gsa/shared").Role }; params: { id: string } },
    reply: import("fastify").FastifyReply,
    action: ReportAction,
    comment?: string,
  ): Promise<unknown> {
    const me = req.currentUser!;
    try {
      const updated = await performTransition(req.params.id, action, me, comment);
      if (!updated) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      return reply.send({
        id: updated.id,
        ownerId: updated.ownerId,
        title: updated.title,
        state: updated.state,
        totalCents: updated.totalCents,
      });
    } catch (err) {
      if (err instanceof TransitionError) {
        const status = err.code === "NON_AUTORIZZATO" ? 403 : 409;
        return reply.code(status).send({ error: err.code });
      }
      throw err;
    }
  }

  app.post<{ Params: { id: string } }>(
    "/:id/submit",
    { preHandler: app.requireAuth },
    (req, reply) => runTransition(req, reply, "submit"),
  );

  app.post<{ Params: { id: string } }>(
    "/:id/approve",
    { preHandler: app.requireAuth },
    (req, reply) => runTransition(req, reply, "approve"),
  );

  app.post<{ Params: { id: string } }>(
    "/:id/reject",
    { preHandler: app.requireAuth },
    (req, reply) => runTransition(req, reply, "reject"),
  );

  app.post<{ Params: { id: string } }>(
    "/:id/revise",
    { preHandler: app.requireAuth },
    (req, reply) => {
      const parsed = reviseSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      return runTransition(req, reply, "revise", parsed.data.comment);
    },
  );
```

- [ ] **Step 2: Wire report and item routes into the `/api` group in `app.ts`**

Add imports at the top of `packages/server/src/app.ts`:

```ts
import { reportRoutes } from "./reports/reports.routes.js";
import { itemRoutes } from "./items/items.routes.js";
```

Inside the `/api` register callback, add the report and item registrations after `userRoutes`:

```ts
      await api.register(reportRoutes, { prefix: "/reports" });
      await api.register(itemRoutes, { prefix: "/reports/:reportId/items" });
```

- [ ] **Step 3: Verify the whole server builds**

Run: `npm run build --workspace packages/server`
Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/reports/reports.routes.ts packages/server/src/app.ts
git commit -m "feat(reports): submit/approve/reject/revise transition endpoints"
```

---

## Task 12: Reports & items API integration tests

**Files:**
- Test: `packages/server/test/reports.api.test.ts`

- [ ] **Step 1: Write the integration tests**

```ts
// packages/server/test/reports.api.test.ts
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

async function loginAs(email: string, password: string) {
  const agent = request.agent(app.server);
  await agent.post("/api/login").send({ email, password });
  return agent;
}

// A manager and an employee who reports to them, plus an unrelated employee.
async function seedOrg() {
  const manager = await seedUser({
    email: "mgr@example.com",
    password: "password123",
    fullName: "Marco Responsabile",
    role: "MANAGER",
  });
  const employee = await seedUser({
    email: "emp@example.com",
    password: "password123",
    fullName: "Elsa Dipendente",
    role: "EMPLOYEE",
    managerId: manager.id,
  });
  const other = await seedUser({
    email: "other@example.com",
    password: "password123",
    fullName: "Altro Dipendente",
    role: "EMPLOYEE",
  });
  return { manager, employee, other };
}

beforeEach(async () => {
  await resetDb();
});

describe("reports lifecycle", () => {
  it("requires authentication to list reports", async () => {
    const res = await request(app.server).get("/api/reports");
    expect(res.status).toBe(401);
  });

  it("employee creates a report, adds items, total updates", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");

    const created = await emp.post("/api/reports").send({ title: "Trasferta Milano" });
    expect(created.status).toBe(201);
    expect(created.body.state).toBe("CREATED");
    const id = created.body.id;

    const i1 = await emp.post(`/api/reports/${id}/items`).send({
      category: "TRANSPORT",
      date: "2026-05-20",
      description: "Treno A/R",
      amountCents: 4500,
    });
    expect(i1.status).toBe(201);

    await emp.post(`/api/reports/${id}/items`).send({
      category: "MEALS_LODGING",
      date: "2026-05-20",
      description: "Hotel",
      amountCents: 9000,
    });

    const detail = await emp.get(`/api/reports/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.totalCents).toBe(13500);
  });

  it("rejects a MILEAGE item (not supported until Slice 3)", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Auto" });
    const res = await emp.post(`/api/reports/${created.body.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Viaggio",
      amountCents: 1000,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("runs the full approve path: submit → approve by the manager", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Trasferta" });
    const id = created.body.id;
    await emp.post(`/api/reports/${id}/items`).send({
      category: "TRANSPORT",
      date: "2026-05-20",
      description: "Taxi",
      amountCents: 3000,
    });

    const submit = await emp.post(`/api/reports/${id}/submit`);
    expect(submit.status).toBe(200);
    expect(submit.body.state).toBe("READY_FOR_APPROVAL");

    const mgr = await loginAs("mgr@example.com", "password123");
    const approve = await mgr.post(`/api/reports/${id}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.state).toBe("APPROVED");
  });

  it("revise requires a comment and moves to IN_REVISION, then resubmit loops", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Trasferta" });
    const id = created.body.id;
    await emp.post(`/api/reports/${id}/submit`);

    const mgr = await loginAs("mgr@example.com", "password123");
    const noComment = await mgr.post(`/api/reports/${id}/revise`).send({});
    expect(noComment.status).toBe(400);

    const revise = await mgr.post(`/api/reports/${id}/revise`).send({ comment: "Manca ricevuta" });
    expect(revise.status).toBe(200);
    expect(revise.body.state).toBe("IN_REVISION");

    const resubmit = await emp.post(`/api/reports/${id}/submit`);
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.state).toBe("READY_FOR_APPROVAL");
  });

  it("a non-managing user cannot approve someone else's report (403)", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Trasferta" });
    const id = created.body.id;
    await emp.post(`/api/reports/${id}/submit`);

    const other = await loginAs("other@example.com", "password123");
    const res = await other.post(`/api/reports/${id}/approve`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NON_AUTORIZZATO");
  });

  it("rejects an illegal transition with 409", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Trasferta" });
    // approve directly from CREATED is illegal
    const mgr = await loginAs("mgr@example.com", "password123");
    const res = await mgr.post(`/api/reports/${created.body.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("TRANSIZIONE_NON_VALIDA");
  });

  it("locks item editing once decided (APPROVED → 409)", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const created = await emp.post("/api/reports").send({ title: "Trasferta" });
    const id = created.body.id;
    await emp.post(`/api/reports/${id}/submit`);
    const mgr = await loginAs("mgr@example.com", "password123");
    await mgr.post(`/api/reports/${id}/approve`);

    const res = await emp.post(`/api/reports/${id}/items`).send({
      category: "OTHER",
      date: "2026-05-20",
      description: "Tardi",
      amountCents: 100,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("NOTA_SPESE_NON_MODIFICABILE");
  });

  it("manager approval queue lists only their reports awaiting approval", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const mine = await emp.post("/api/reports").send({ title: "Mia" });
    await emp.post(`/api/reports/${mine.body.id}/submit`);

    // other employee (no manager) submits one too
    const otherAgent = await loginAs("other@example.com", "password123");
    const theirs = await otherAgent.post("/api/reports").send({ title: "Loro" });
    await otherAgent.post(`/api/reports/${theirs.body.id}/submit`);

    const mgr = await loginAs("mgr@example.com", "password123");
    const queue = await mgr.get("/api/reports?scope=approvals");
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0].id).toBe(mine.body.id);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test --workspace packages/server -- test/reports.api.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 3: Run the full server suite**

Run: `npm test --workspace packages/server`
Expected: all unit + API tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/test/reports.api.test.ts
git commit -m "test(reports): lifecycle, guards, and approval-queue API coverage"
```

---

## Task 13: Italian strings for states, categories, and the reports UI

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Extend the Italian dictionary**

Add the following keys inside the `translation` object in `packages/web/src/i18n.ts` (alongside the existing `app`, `nav`, `roles`, `users`, `common` blocks). Extend `nav` and add `states`, `categories`, `reports`, `items`:

```ts
    nav: {
      users: "Utenti",
      reports: "Note spese",
      approvals: "Approvazioni",
      logout: "Esci",
    },
    states: {
      CREATED: "Bozza",
      READY_FOR_APPROVAL: "Da approvare",
      IN_REVISION: "In revisione",
      APPROVED: "Approvata",
      REJECTED: "Respinta",
      SENT_FOR_PAYMENT: "Inviata al pagamento",
      PAID: "Pagata",
    },
    categories: {
      MILEAGE: "Rimborso chilometrico",
      MEALS_LODGING: "Vitto e alloggio",
      TRANSPORT: "Trasporti",
      OTHER: "Altro",
    },
    reports: {
      title: "Le mie note spese",
      newTitle: "Titolo della nota spese",
      create: "Crea nota spese",
      empty: "Nessuna nota spese presente.",
      state: "Stato",
      total: "Totale",
      created: "Creata il",
      open: "Apri",
      back: "Torna all'elenco",
      submit: "Invia per approvazione",
      approve: "Approva",
      reject: "Respinta",
      revise: "Richiedi revisione",
      revisePrompt: "Motivo della revisione",
      approvalsTitle: "Note spese da approvare",
      owner: "Dipendente",
      history: "Storico",
      createError: "Impossibile creare la nota spese.",
      actionError: "Operazione non consentita.",
    },
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
    },
```

(Replace the existing `nav: { users: "Utenti", logout: "Esci" },` line with the extended `nav` block above. Keep `app`, `login`, `roles`, `users`, `common` unchanged.)

- [ ] **Step 2: Verify the web build**

Run: `npm run build --workspace packages/web`
Expected: type-checks/builds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): Italian strings for report states, categories, and UI"
```

---

## Task 14: Web API client — report/item types and calls

**Files:**
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Add report/item types and the `del` verb**

In `packages/web/src/api/client.ts`, add `del` to the `api` object and append the domain types. Use the shared enums:

Add `del` inside the `api` object:
```ts
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
```

Append the domain types (importing the enums from shared):
```ts
import type { ReportState, Category, MoneyCategory } from "@gsa/shared";
export type { ReportState, Category, MoneyCategory };

export interface ReportSummary {
  id: string;
  ownerId: string;
  title: string;
  state: ReportState;
  totalCents: number;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ReportItem {
  id: string;
  category: Category;
  date: string;
  description: string;
  amountCents: number;
  vatCents: number | null;
  notes: string | null;
}

export interface ReportEvent {
  fromState: ReportState;
  toState: ReportState;
  comment: string | null;
  createdAt: string;
}

export interface ReportDetail extends ReportSummary {
  owner: { id: string; fullName: string; managerId: string | null };
  items: ReportItem[];
  events: ReportEvent[];
}

export interface NewItemInput {
  category: MoneyCategory;
  date: string;
  description: string;
  amountCents: number;
  vatCents?: number | null;
  notes?: string | null;
}
```

- [ ] **Step 2: Verify the web build**

Run: `npm run build --workspace packages/web`
Expected: type-checks/builds.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/client.ts
git commit -m "feat(web): report/item API types and delete verb"
```

---

## Task 15: Reports list page (own reports + create)

**Files:**
- Create: `packages/web/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// packages/web/src/pages/ReportsPage.tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportsPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<ReportSummary[]>("/reports");
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/reports", { title });
      setTitle("");
      await refresh();
    } catch {
      setError(t("reports.createError"));
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("reports.title")}</h1>

      <form onSubmit={onCreate} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          placeholder={t("reports.newTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <button type="submit">{t("reports.create")}</button>
      </form>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p>{t("reports.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("reports.newTitle")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.state")}</th>
              <th style={{ textAlign: "right" }}>{t("reports.total")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.created")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{t(`states.${r.state}`)}</td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(r.totalCents)}</td>
                <td>{formatDateIt(r.createdAt)}</td>
                <td>
                  <Link to={`/note-spese/${r.id}`}>{t("reports.open")}</Link>
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

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/pages/ReportsPage.tsx
git commit -m "feat(web): reports list and create page"
```

---

## Task 16: Report detail page (items + submit + manager actions)

**Files:**
- Create: `packages/web/src/pages/ReportDetailPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// packages/web/src/pages/ReportDetailPage.tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { actionsFor, MONEY_CATEGORIES, type MoneyCategory } from "@gsa/shared";
import { api, type ReportDetail } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-item form state
  const [category, setCategory] = useState<MoneyCategory>("TRANSPORT");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setReport(await api.get<ReportDetail>(`/reports/${id}`));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!report) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage = available.some((a) => a === "approve" || a === "reject" || a === "revise");

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/reports/${report!.id}/items`, {
        category,
        date,
        description,
        amountCents: Math.round(Number(amount) * 100),
      });
      setDescription("");
      setAmount("");
      setDate("");
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
          <select value={category} onChange={(e) => setCategory(e.target.value as MoneyCategory)}>
            {MONEY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            placeholder={t("items.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
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

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/pages/ReportDetailPage.tsx
git commit -m "feat(web): report detail page with items and workflow actions"
```

---

## Task 17: Approvals page, navigation, and routing

**Files:**
- Create: `packages/web/src/pages/ApprovalsPage.tsx`
- Create: `packages/web/src/components/NavBar.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Create the manager approval queue page**

```tsx
// packages/web/src/pages/ApprovalsPage.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ApprovalsPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<ReportSummary[]>("/reports?scope=approvals").then((list) => {
      setReports(list);
      setLoading(false);
    });
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("reports.approvalsTitle")}</h1>
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p>{t("reports.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("reports.newTitle")}</th>
              <th style={{ textAlign: "right" }}>{t("reports.total")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.created")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(r.totalCents)}</td>
                <td>{formatDateIt(r.createdAt)}</td>
                <td>
                  <Link to={`/note-spese/${r.id}`}>{t("reports.open")}</Link>
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

- [ ] **Step 2: Create the role-aware navigation bar**

```tsx
// packages/web/src/components/NavBar.tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { hasAtLeast } from "@gsa/shared";
import { useAuth } from "../auth/AuthContext.js";

export function NavBar(): JSX.Element | null {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "12px 24px",
        borderBottom: "1px solid #ccc",
        fontFamily: "system-ui",
      }}
    >
      <Link to="/note-spese">{t("nav.reports")}</Link>
      {hasAtLeast(user.role, "MANAGER") && <Link to="/approvazioni">{t("nav.approvals")}</Link>}
      {user.role === "ADMIN" && <Link to="/utenti">{t("nav.users")}</Link>}
      <span style={{ marginLeft: "auto" }}>{user.fullName}</span>
      <button onClick={() => void logout()}>{t("nav.logout")}</button>
    </nav>
  );
}
```

- [ ] **Step 3: Wire routes and the nav bar in `App.tsx`**

Replace the contents of `packages/web/src/App.tsx` with:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { NavBar } from "./components/NavBar.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { ReportDetailPage } from "./pages/ReportDetailPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";

function Routed(): JSX.Element {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/note-spese" element={<ReportsPage />} />
        <Route path="/note-spese/:id" element={<ReportDetailPage />} />
        <Route path="/approvazioni" element={<ApprovalsPage />} />
        <Route path="/utenti" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/note-spese" replace />} />
      </Routes>
    </>
  );
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
```

> Note: `UsersPage` currently renders its own header with the logout button. That is now duplicated by `NavBar`. Leave `UsersPage` as-is for this slice (it still works); a follow-up cleanup can remove its inline header. Do not restructure `UsersPage` here — it is out of scope.

- [ ] **Step 4: Verify the web build**

Run: `npm run build --workspace packages/web`
Expected: type-checks/builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/ApprovalsPage.tsx packages/web/src/components/NavBar.tsx packages/web/src/App.tsx
git commit -m "feat(web): approvals queue, role-aware nav, and report routing"
```

---

## Task 18: Dev seed script (admin + manager + employee)

The E2E test and manual testing need a manager and an employee who reports to them. This idempotent script creates them.

**Files:**
- Create: `packages/server/src/scripts/seedDev.ts`
- Modify: `packages/server/package.json` (add `seed:dev` script)

- [ ] **Step 1: Create the seed script**

```ts
// packages/server/src/scripts/seedDev.ts
import "../loadEnv.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import type { Role } from "@gsa/shared";

async function upsertUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  managerEmail?: string;
}): Promise<string> {
  const managerId = opts.managerEmail
    ? (await prisma.user.findUnique({ where: { email: opts.managerEmail } }))?.id ?? null
    : null;
  const passwordHash = await hashPassword(opts.password);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { fullName: opts.fullName, role: opts.role, managerId, active: true },
    create: {
      email: opts.email,
      passwordHash,
      fullName: opts.fullName,
      role: opts.role,
      managerId,
    },
  });
  return user.id;
}

async function main(): Promise<void> {
  await upsertUser({
    email: "admin@azienda.it",
    password: "password123",
    fullName: "Anna Admin",
    role: "ADMIN",
  });
  await upsertUser({
    email: "responsabile@azienda.it",
    password: "password123",
    fullName: "Marco Responsabile",
    role: "MANAGER",
  });
  await upsertUser({
    email: "dipendente@azienda.it",
    password: "password123",
    fullName: "Elsa Dipendente",
    role: "EMPLOYEE",
    managerEmail: "responsabile@azienda.it",
  });
  // eslint-disable-next-line no-console
  console.log("Seeded dev users: admin@/responsabile@/dipendente@azienda.it (password123)");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Add the script to `packages/server/package.json`**

In the `"scripts"` block, add:
```json
    "seed:dev": "tsx src/scripts/seedDev.ts",
```

- [ ] **Step 3: Run it against the dev DB**

Run:
```bash
npm run seed:dev --workspace packages/server
```
Expected: prints the seeded-users line. (Re-running is safe — it upserts.)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/scripts/seedDev.ts packages/server/package.json
git commit -m "feat(server): idempotent dev seed for manager/employee org"
```

---

## Task 19: E2E happy path (employee submits, manager approves)

**Files:**
- Create: `packages/web/e2e/reports.spec.ts`

- [ ] **Step 1: Write the E2E spec**

```ts
// packages/web/e2e/reports.spec.ts
import { test, expect } from "@playwright/test";

// Precondition: `npm run seed:dev --workspace packages/server` has created
// dipendente@azienda.it (employee) reporting to responsabile@azienda.it
// (manager), both with password "password123". Both servers are started by the
// Playwright webServer config.

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

test("employee creates and submits a report; manager approves it", async ({ page }) => {
  const unique = `Trasferta E2E ${Date.now()}`;

  // Employee: create a report, add an item, submit.
  await login(page, "dipendente@azienda.it");
  await page.getByPlaceholder("Titolo della nota spese").fill(unique);
  await page.getByRole("button", { name: "Crea nota spese" }).click();

  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();

  await page.getByPlaceholder("Descrizione").fill("Treno A/R");
  await page.getByPlaceholder("Importo (€)").fill("45,00".replace(",", "."));
  await page.getByLabel("Data").fill("2026-05-20");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();
  await expect(page.getByText("Treno A/R")).toBeVisible();

  await page.getByRole("button", { name: "Invia per approvazione" }).click();
  await expect(page.getByText("Da approvare")).toBeVisible();

  // Manager: log in, open the approval queue, approve.
  await page.getByRole("button", { name: "Esci" }).click();
  await login(page, "responsabile@azienda.it");
  await page.getByRole("link", { name: "Approvazioni" }).click();
  await expect(page.getByRole("heading", { name: "Note spese da approvare" })).toBeVisible();

  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await page.getByRole("button", { name: "Approva" }).click();
  await expect(page.getByText("Approvata")).toBeVisible();
});
```

- [ ] **Step 2: Ensure the dev DB is seeded, then run the E2E suite**

Run:
```bash
npm run seed:dev --workspace packages/server
npm run e2e --workspace packages/web
```
Expected: both specs PASS (`login.spec.ts` from Slice 1 and the new `reports.spec.ts`). Playwright auto-starts both servers.

> If the existing `login.spec.ts` expects the post-login heading "Gestione utenti", it still logs in as `admin@azienda.it`, who now lands on `/note-spese` ("Le mie note spese") because the default authenticated route changed. Update `login.spec.ts`'s post-login assertions to expect "Le mie note spese" and the "Esci" button (the admin reaches Users via the nav link). Make that small edit if the spec fails, and include it in this task's commit.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/reports.spec.ts packages/web/e2e/login.spec.ts
git commit -m "test(e2e): employee submit and manager approve happy path"
```

---

## Task 20: Full verification, README, and self-review

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the entire test suite from the repo root**

Run:
```bash
npm run build --workspace packages/shared
npm test --workspaces --if-present
```
Expected: server unit + API tests PASS (roles, password, state machine, money, auth incl. rate-limit, users, reports lifecycle); web unit tests PASS. No failures.

- [ ] **Step 2: Build everything**

Run:
```bash
npm run build --workspace packages/shared
npm run build --workspace packages/server
npm run build --workspace packages/web
```
Expected: all three build cleanly.

- [ ] **Step 3: Update the README**

In `README.md`, add a "Slice 2" section documenting:
- The new `@gsa/shared` package and that `npm install` builds it automatically (`prepare`).
- The API is now under `/api/*`.
- The expense-report workflow: employee creates a report → adds money items (vitto/alloggio, trasporti, altro) → submits; the manager approves / respinge / richiede revisione. Mileage is Slice 3; payment/export is Slice 4.
- `npm run seed:dev --workspace packages/server` creates `admin@`, `responsabile@`, `dipendente@azienda.it` (all `password123`) for manual testing and E2E.
- Keep claims accurate: only the money categories are supported; `MILEAGE`, payment, and CSV export are not yet implemented.

- [ ] **Step 4: Self-review (read the diff with fresh eyes)**

Verify before finalizing:
- The state machine is the single source of truth — server `performTransition` and web `actionsFor` both derive from `@gsa/shared`; no transition rules are duplicated.
- No endpoint leaks `passwordHash` (reports/items selects never include it; user selects use the existing `publicSelect`/scoped selects).
- Authorization is enforced server-side on every report/item/transition route; the web nav is cosmetic only.
- Money is integer cents end to end; the web converts the euro input via `Math.round(Number(amount) * 100)` and the server validates `z.number().int().nonnegative()`.
- The UI is entirely Italian (states, categories, buttons, errors) and uses `it-IT` formatters.
- `.env` is still gitignored and uncommitted (`git ls-files | grep -E "\.env$"` returns nothing).
- `MILEAGE` items are rejected by the API (400) this slice.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document Slice 2 expense-report workflow and /api namespacing"
```

---

## Self-Review (plan vs. spec)

**Spec coverage:**
- §4 Expense Report as unit of work → `ExpenseReport` + `ExpenseItem` (Task 6), CRUD (Tasks 9–10). ✅
- §5 State machine + editing/permission phases + `ReportEvent` audit → pure machine (Task 2), service with audit + actor resolution (Task 8), transition endpoints (Task 11), `isEditableState` lockout (Tasks 9–10, tested Task 12). ✅
- §6 Categories → `Category` enum incl. `MILEAGE`; money categories supported, `MILEAGE` rejected until Slice 3 (Tasks 6, 10, 12). Optional VAT field present (`vatCents`). ✅ (within slice scope)
- §9 Payment transitions defined in the pure machine (`send-payment`/`mark-paid`) but intentionally not exposed — deferred to Slice 4. ✅ (documented deviation)
- §13 Data model → models match (mileage scalar columns deferred to Slice 3, noted). ✅
- §14 API surface → `/api/reports` CRUD + transitions + nested items implemented; mileage quote, ACI, payment export are later slices. ✅
- §15 Testing strategy → unit (state machine, money), API (full lifecycle + guards), thin E2E (submit→approve). ✅
- §16 Italian localization → states/categories/UI strings + `it-IT` formatters (Tasks 13, 16, 17). ✅
- Recommendations → `/api` namespacing (Task 3), login hardening + rate limit (Tasks 4, 7), shared package promoting `Role` (Tasks 1–2). ✅

**Deviations (intentional, documented):** state machine placed in `@gsa/shared` rather than server `core/` (so both tiers share one source of truth); payment transitions defined-but-not-exposed; mileage scalar columns deferred to Slice 3 to avoid unused columns now.

**Type consistency:** `ReportState`, `Category`, `MoneyCategory`, `ReportAction`, `ActorKind`, `TransitionDef`, `findTransition`, `actionsFor`, `isEditableState` defined once in `@gsa/shared` and imported consistently by server (`reports.service.ts`, `reports.routes.ts`, `items.*`) and web (`client.ts`, `ReportDetailPage.tsx`, `NavBar.tsx`). Error codes (`NOTA_SPESE_NON_TROVATA`, `NOTA_SPESE_NON_MODIFICABILE`, `VOCE_NON_TROVATA`, `TRANSIZIONE_NON_VALIDA`, `NON_AUTORIZZATO`, `DATI_NON_VALIDI`) used consistently across routes and tests.
