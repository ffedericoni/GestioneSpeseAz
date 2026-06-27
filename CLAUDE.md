# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gestione Spese Aziendali** is an expense management system for tracking, approving, and reimbursing business expenses. The UI is entirely in Italian; code and APIs are in English.

The system tracks expense reports with a state machine (Draft → Ready for Approval → In Revision/Approved/Rejected → Sent for Payment → Paid), supports mileage reimbursement with ACI vehicle rates, and exports data for accounting.

## Architecture

This is a **monorepo with three packages** (NPM workspaces):

### packages/shared (@gsa/shared)
Pure TypeScript domain model—the **single source of truth** for business logic. Contains:
- **Role hierarchy** (EMPLOYEE, MANAGER, FINANCE, ADMIN): roles.ts
- **Expense report state machine** (transitions defined once, shared by server and web): reports.ts
- **Mileage calculations** (distance baseline, tolerance, rate snapshotting): mileage.ts
- **ACI vehicle rate parsing** (CSV imports): aci.ts

Compiled to dist/ by `npm run build --workspace packages/shared`. Web and server both depend on this as @gsa/shared. The prepare script auto-builds on `npm install`.

### packages/server (@gsa/server)
Node.js backend (Fastify 4, Prisma ORM, PostgreSQL).

Key structure:
- src/app.ts: Fastify app factory; mounts all route modules under /api
- src/plugins/session.ts: Encrypted cookie-based sessions; exports requireAuth and requireRole decorators for routes
- src/core/: Pure domain logic (money rounding, distance calc, state transitions) used by routes
- src/auth/: Login, session (email + password, constant-time comparison, rate limiting)
- src/users/, src/reports/, src/items/: REST routes for CRUD operations
- src/aci/, src/vehicles/: ACI rate imports and vehicle registration
- src/payment/, src/items/mileage.routes.ts: Expense workflow and mileage quoting
- src/settings/: Global configuration (mileage tolerance)
- prisma/schema.prisma: Database schema

Test setup: Vitest (unit + integration). Tests share a single PostgreSQL test DB; they run sequentially to avoid race conditions. src/loadEnv.ts loads .env before tests run.

### packages/web (@gsa/web)
React 18 + Vite SPA (Italian UI).

Key structure:
- src/pages/: Route pages (Login, Dashboard, Reports, etc.)
- src/components/: Reusable UI components
- src/api/: HTTP client (fetch wrappers for /api/*)
- src/auth/: Session context and login logic
- src/i18n.ts: i18next configuration (Italian)
- src/format.ts: Utilities for currency, dates

Dev server: Vite on port 5173; proxies /api to http://localhost:3001.

E2E tests: Playwright (1 worker to avoid DB races with seeded data). Auto-starts both server and web dev servers.

---

## Common Commands

### Setup
    npm install                                   # Install all packages + auto-build shared
    cp .env.example packages/server/.env         # Setup env vars
    npm run prisma:migrate --workspace packages/server   # Apply migrations to dev DB
    npm run create:admin --workspace packages/server -- admin@azienda.it password123 "Admin Name"
    npm run seed:dev --workspace packages/server  # Create test users

### Development
    npm run dev:server                  # Start Fastify API on http://localhost:3001
    npm run dev:web                     # Start Vite dev server on http://localhost:5173

### Building
    npm run build --workspace packages/shared  # Compile shared domain model
    npm run build --workspace packages/server  # Compile server
    npm run build --workspace packages/web     # Build web SPA
    npm run build                              # Build all

### Testing
    npm test                                       # Run all unit + integration tests
    npm test --workspace packages/server          # Only server tests
    npm test --workspace packages/web             # Only web tests
    npm run test:watch --workspace packages/server  # Watch mode
    npm run e2e --workspace packages/web           # Playwright E2E

---

## Key Design Patterns

### State Machine (Shared Domain)
The expense report lifecycle is defined once in @gsa/shared (packages/shared/src/reports.ts). Both server and web derive transitions from it:
- Server validates transitions in route handlers
- Web reads allowed transitions to show/hide buttons

This eliminates duplicated logic and ensures UI and server agree.

### Role-Based Authorization
Routes use the app.requireRole(Role.MANAGER) decorator (from session.ts). This checks both authentication and role in one step.

### Mileage Snapshot
When a mileage item is created, all calculated values (distance, rate, tolerance) are frozen on the ExpenseItem record and never change. This allows expense reports to remain auditable even if ACI rates or tolerance settings change later.

Distance calculation is behind a port (DistanceProvider in src/core/distanceProvider.ts); currently manual, ready for a real routing provider in the future.

### CSV Export for Accounting
Two exports under /api/reports/export/:
- reports.csv: one row per expense report
- items.csv: one row per expense item (includes mileage details)

Format: Italian (semicolon separator, comma decimal, UTF-8 BOM, CRLF). Download via <a download> so session cookie is included.

---

## Database Schema (PostgreSQL)

Key tables (see prisma/schema.prisma):
- User: Email, password hash, role, manager, active flag
- ExpenseReport: Title, state, owner, decidedBy, totalCents, paidAt, paymentReference
- ExpenseItem: Category, amount, VAT, description; mileage-specific fields (vehicleId, baselineKm, tolerancePercent, enteredKm, ratePerKm) frozen at creation
- ReportEvent: Audit log (state transitions with actor and optional comment)
- Vehicle: User's vehicle, linked to AciRate
- AciRate: Vehicle tariff (euros/km) by year, make, model, fuel, variant
- Setting: Global key-value store (e.g., mileageTolerancePercent)

---

## Environment & Configuration

Required env vars (see .env.example):
- DATABASE_URL: Dev PostgreSQL
- TEST_DATABASE_URL: Test PostgreSQL (separate DB)
- SESSION_SECRET: 32+ char random string
- PORT: Server port (default 3001)
- LOGIN_RATE_MAX: Max login attempts per IP/minute (default 5)

Development requires Node 20+ and PostgreSQL on localhost:5432.

---

## Important Notes for Contributors

1. **Shared package must be built before server/web changes take effect.** Modify packages/shared/src/*.ts, then run `npm run build --workspace packages/shared` (or `npm install`).

2. **Prisma generate must run after schema changes.** Regenerated by prisma generate or prisma migrate.

3. **Test DB is separate.** Use TEST_DATABASE_URL. Apply migrations explicitly: `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy --schema=packages/server/prisma/schema.prisma`.

4. **E2E tests run serially** with workers: 1. Seeded users (admin@, responsabile@, dipendente@) created by `npm run seed:dev`. Do not run E2E tests in parallel.

5. **All business logic lives in shared.** Routes validate transitions using @gsa/shared; core calculations are in src/core/. Server logic stays thin and testable.

6. **Localization is Italian.** Web uses i18next. Server error messages are Italian (e.g., "NON_AUTENTICATO", "NON_AUTORIZZATO").
