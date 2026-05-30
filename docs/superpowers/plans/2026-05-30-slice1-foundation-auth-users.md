# Slice 1 — Foundation, Authentication & User Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo and deliver a working, testable vertical slice: an admin can log in and manage users (create/list/update/deactivate, assign role and manager) through an entirely-Italian web UI, backed by a Fastify + Prisma + PostgreSQL API with session auth and role guards.

**Architecture:** TypeScript npm-workspaces monorepo with two packages: `server` (Fastify + Prisma + PostgreSQL) and `web` (React + Vite). Pure, framework-free authorization rules live in `server/src/core/` and are unit-tested first. Fastify routes are thin wrappers that call core logic and Prisma. Auth uses email+password (bcrypt hash) with an encrypted-cookie session (`@fastify/secure-session`). The web app uses `react-i18next` with an Italian-only dictionary and `Intl`-based `it-IT` formatters.

**Tech Stack:** Node 20+, TypeScript 5, Fastify 4, Prisma 5, PostgreSQL, `@fastify/secure-session`, `@fastify/cookie`, `bcryptjs`, `zod`, Vitest, Supertest, React 18, Vite 5, `react-i18next`, `react-router-dom`, Playwright.

---

## File Structure

```
gestione-spese-az/
├─ package.json                       # workspaces root, shared scripts
├─ .env.example                       # documents required env vars
├─ packages/
│  ├─ server/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ vitest.config.ts
│  │  ├─ .env                         # local dev secrets (gitignored)
│  │  ├─ prisma/schema.prisma         # User model (this slice)
│  │  ├─ src/
│  │  │  ├─ core/roles.ts             # PURE role hierarchy + guards
│  │  │  ├─ core/roles.test.ts
│  │  │  ├─ auth/password.ts          # bcrypt hash/verify
│  │  │  ├─ auth/password.test.ts
│  │  │  ├─ auth/auth.routes.ts       # POST /login, /logout, GET /me
│  │  │  ├─ users/users.schemas.ts    # zod request schemas
│  │  │  ├─ users/users.routes.ts     # CRUD under /users (Admin)
│  │  │  ├─ plugins/session.ts        # secure-session + requireRole
│  │  │  ├─ db.ts                     # PrismaClient singleton
│  │  │  ├─ app.ts                    # buildApp() factory
│  │  │  └─ server.ts                 # listen entrypoint
│  │  └─ test/
│  │     ├─ helpers.ts                # buildTestApp(), resetDb(), seedAdmin()
│  │     ├─ auth.api.test.ts
│  │     └─ users.api.test.ts
│  └─ web/
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ vite.config.ts
│     ├─ playwright.config.ts
│     ├─ index.html
│     ├─ src/
│     │  ├─ main.tsx
│     │  ├─ App.tsx                    # router + auth gate
│     │  ├─ i18n.ts                    # Italian dictionary
│     │  ├─ format.ts                  # it-IT date/currency/number
│     │  ├─ format.test.ts
│     │  ├─ api/client.ts              # fetch wrapper (credentials: include)
│     │  ├─ auth/AuthContext.tsx
│     │  ├─ pages/LoginPage.tsx
│     │  └─ pages/UsersPage.tsx
│     └─ e2e/login.spec.ts
└─ docs/… (specs, plans)
```

Responsibility split: `core/` holds pure rules (no DB/HTTP); `plugins/session.ts` owns session + the `requireRole` guard; each domain (`auth`, `users`) owns its routes + schemas; `app.ts` wires everything so tests can build an isolated instance.

---

## Task 1: Monorepo workspace root

**Files:**
- Create: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "gestione-spese-az",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "packages/server",
    "packages/web"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "dev:server": "npm run dev --workspace packages/server",
    "dev:web": "npm run dev --workspace packages/web"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```bash
# PostgreSQL connection for the server package
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestione_spese?schema=public"
# Separate database used by the integration test suite
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestione_spese_test?schema=public"
# 32+ char secret used to encrypt the session cookie
SESSION_SECRET="change-me-to-a-long-random-string-min-32-chars"
```

- [ ] **Step 3: Commit**

```bash
git add package.json .env.example
git commit -m "chore: scaffold npm workspaces root"
```

---

## Task 2: Server package scaffold & TypeScript config

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/.env`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@gsa/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/secure-session": "^7.5.1",
    "@prisma/client": "^5.18.0",
    "bcryptjs": "^2.4.3",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.14.10",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.18.0",
    "supertest": "^7.0.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `packages/server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres DB; run files sequentially to
    // avoid cross-test interference while resetDb() truncates tables.
    fileParallelism: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 4: Create `packages/server/.env` (gitignored; mirrors `.env.example`)**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestione_spese?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestione_spese_test?schema=public"
SESSION_SECRET="dev-only-secret-please-change-me-32chars-minimum"
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: completes; creates root `node_modules` and `package-lock.json`.

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json packages/server/vitest.config.ts package-lock.json
git commit -m "chore: scaffold server package"
```

(Note: `packages/server/.env` is ignored by the existing `.gitignore` rule `.env.*`/`.env`; do not force-add it.)

---

## Task 3: Pure role hierarchy and authorization guard (core, TDD)

**Files:**
- Create: `packages/server/src/core/roles.ts`
- Test: `packages/server/src/core/roles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/core/roles.test.ts
import { describe, it, expect } from "vitest";
import { ROLES, hasAtLeast, canManageUsers, type Role } from "./roles.js";

describe("roles", () => {
  it("exposes the four roles", () => {
    expect(ROLES).toEqual(["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"]);
  });

  it("hasAtLeast respects the privilege ordering", () => {
    expect(hasAtLeast("ADMIN", "FINANCE")).toBe(true);
    expect(hasAtLeast("FINANCE", "FINANCE")).toBe(true);
    expect(hasAtLeast("EMPLOYEE", "MANAGER")).toBe(false);
    expect(hasAtLeast("MANAGER", "ADMIN")).toBe(false);
  });

  it("only ADMIN can manage users", () => {
    const expected: Record<Role, boolean> = {
      EMPLOYEE: false,
      MANAGER: false,
      FINANCE: false,
      ADMIN: true,
    };
    for (const role of ROLES) {
      expect(canManageUsers(role)).toBe(expected[role]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/server -- src/core/roles.test.ts`
Expected: FAIL — cannot resolve `./roles.js` (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/server/src/core/roles.ts
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/server -- src/core/roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/roles.ts packages/server/src/core/roles.test.ts
git commit -m "feat(core): role hierarchy and user-management guard"
```

---

## Task 4: Password hashing (TDD)

**Files:**
- Create: `packages/server/src/auth/password.ts`
- Test: `packages/server/src/auth/password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/auth/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("produces a hash different from the plaintext", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(hash).not.toBe("s3cret-pw");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("s3cret-pw", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/server -- src/auth/password.test.ts`
Expected: FAIL — cannot resolve `./password.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/server/src/auth/password.ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/server -- src/auth/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/password.ts packages/server/src/auth/password.test.ts
git commit -m "feat(auth): bcrypt password hashing"
```

---

## Task 5: Prisma schema, client singleton, and first migration

**Files:**
- Create: `packages/server/prisma/schema.prisma`
- Create: `packages/server/src/db.ts`

- [ ] **Step 1: Create the Prisma schema with the `User` model**

```prisma
// packages/server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  EMPLOYEE
  MANAGER
  FINANCE
  ADMIN
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  fullName     String
  role         Role     @default(EMPLOYEE)
  managerId    String?
  manager      User?    @relation("Reports", fields: [managerId], references: [id])
  reports      User[]   @relation("Reports")
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 2: Create the PrismaClient singleton**

```ts
// packages/server/src/db.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 3: Ensure the dev and test databases exist**

Run (adjust credentials to your local Postgres):
```bash
psql -U postgres -h localhost -c "CREATE DATABASE gestione_spese;" || true
psql -U postgres -h localhost -c "CREATE DATABASE gestione_spese_test;" || true
```
Expected: databases exist (errors if already present are fine).

- [ ] **Step 4: Generate the client and create the migration**

Run:
```bash
npm run prisma:migrate --workspace packages/server -- --name init_user
```
Expected: creates `packages/server/prisma/migrations/<timestamp>_init_user/` and generates the client. The `User` table now exists in the dev DB.

- [ ] **Step 5: Apply the migration to the TEST database**

Run:
```bash
cd packages/server && DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy && cd ../..
```
(Windows PowerShell equivalent: `$env:DATABASE_URL=$env:TEST_DATABASE_URL; npx prisma migrate deploy` from `packages/server`.)
Expected: "All migrations have been successfully applied" against the test DB.

- [ ] **Step 6: Commit**

```bash
git add packages/server/prisma/schema.prisma packages/server/prisma/migrations packages/server/src/db.ts
git commit -m "feat(db): User model and Prisma migration"
```

---

## Task 6: Session plugin and `requireRole` guard

**Files:**
- Create: `packages/server/src/plugins/session.ts`

- [ ] **Step 1: Create the session plugin**

```ts
// packages/server/src/plugins/session.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySecureSession from "@fastify/secure-session";
import fp from "fastify-plugin"; // provided transitively; see note below
import type { Role } from "../core/roles.js";
import { hasAtLeast } from "../core/roles.js";

// Shape stored in the encrypted session cookie.
export interface SessionUser {
  id: string;
  role: Role;
}

declare module "@fastify/secure-session" {
  interface SessionData {
    user: SessionUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      minimum: Role,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser?: SessionUser;
  }
}

async function sessionPluginImpl(app: FastifyInstance): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }

  await app.register(fastifyCookie);
  await app.register(fastifySecureSession, {
    secret,
    salt: "gsa-session-salt", // 16 chars; static salt is fine with a strong secret
    cookieName: "gsa_session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });

  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = req.session.get("user");
      if (!user) {
        await reply.code(401).send({ error: "NON_AUTENTICATO" });
        return;
      }
      req.currentUser = user;
    },
  );

  app.decorate("requireRole", (minimum: Role) => {
    return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = req.session.get("user");
      if (!user) {
        await reply.code(401).send({ error: "NON_AUTENTICATO" });
        return;
      }
      if (!hasAtLeast(user.role, minimum)) {
        await reply.code(403).send({ error: "NON_AUTORIZZATO" });
        return;
      }
      req.currentUser = user;
    };
  });
}

export const sessionPlugin = fp(sessionPluginImpl);
```

> Implementation note: `fastify-plugin` (`fp`) is a dependency of `@fastify/secure-session` but not guaranteed hoisted. If the import fails at runtime, add it explicitly: `npm install fastify-plugin --workspace packages/server`, then commit the updated `package.json`/lockfile.

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build --workspace packages/server`
Expected: compiles with no errors (no behavior to test in isolation yet; exercised by API tests in Tasks 8–9).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/plugins/session.ts packages/server/package.json package-lock.json
git commit -m "feat(auth): secure session plugin with requireRole guard"
```

---

## Task 7: App factory and server entrypoint

**Files:**
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/server.ts`

- [ ] **Step 1: Create the app factory (routes added in later tasks)**

```ts
// packages/server/src/app.ts
import Fastify, { type FastifyInstance } from "fastify";
import { sessionPlugin } from "./plugins/session.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/users.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(sessionPlugin);
  await app.register(authRoutes);
  await app.register(userRoutes, { prefix: "/users" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

> The imports for `authRoutes` and `userRoutes` reference files created in Tasks 8 and 9. Create those files (even as the empty stubs below) before running `build`, or implement Tasks 8–9 first. Recommended order: do Step 1 here, then proceed to Task 8, then Task 9, then return to Step 2.

- [ ] **Step 2: Create the server entrypoint**

```ts
// packages/server/src/server.ts
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit (after Tasks 8–9 exist and `npm run build` passes)**

```bash
git add packages/server/src/app.ts packages/server/src/server.ts
git commit -m "feat(server): app factory and listen entrypoint"
```

---

## Task 8: Auth routes — login / logout / me

**Files:**
- Create: `packages/server/src/auth/auth.routes.ts`

- [ ] **Step 1: Create the auth routes**

```ts
// packages/server/src/auth/auth.routes.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword } from "./password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      // Same response for unknown email / wrong password / inactive account.
      return reply.code(401).send({ error: "CREDENZIALI_NON_VALIDE" });
    }

    req.session.set("user", { id: user.id, role: user.role });
    return reply.send({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  });

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

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/auth/auth.routes.ts
git commit -m "feat(auth): login, logout, and me routes"
```

---

## Task 9: User CRUD routes (Admin-only)

**Files:**
- Create: `packages/server/src/users/users.schemas.ts`
- Create: `packages/server/src/users/users.routes.ts`

- [ ] **Step 1: Create the zod request schemas**

```ts
// packages/server/src/users/users.schemas.ts
import { z } from "zod";
import { ROLES } from "../core/roles.js";

export const roleSchema = z.enum(ROLES);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: roleSchema,
  managerId: z.string().cuid().nullish(),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: roleSchema.optional(),
  managerId: z.string().cuid().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

- [ ] **Step 2: Create the user routes**

```ts
// packages/server/src/users/users.routes.ts
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";

const publicSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  managerId: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = { preHandler: app.requireRole("ADMIN") };

  app.get("/", adminOnly, async () => {
    return prisma.user.findMany({
      select: publicSelect,
      orderBy: { fullName: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/:id", adminOnly, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: publicSelect,
    });
    if (!user) return reply.code(404).send({ error: "UTENTE_NON_TROVATO" });
    return user;
  });

  app.post("/", adminOnly, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return reply.code(409).send({ error: "EMAIL_GIA_REGISTRATA" });

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        fullName: data.fullName,
        role: data.role,
        managerId: data.managerId ?? null,
      },
      select: publicSelect,
    });
    return reply.code(201).send(user);
  });

  app.patch<{ Params: { id: string } }>("/:id", adminOnly, async (req, reply) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const data = parsed.data;

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "UTENTE_NON_TROVATO" });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.managerId !== undefined ? { managerId: data.managerId } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.password !== undefined
          ? { passwordHash: await hashPassword(data.password) }
          : {}),
      },
      select: publicSelect,
    });
    return user;
  });
}
```

- [ ] **Step 3: Verify the whole server builds**

Run: `npm run build --workspace packages/server`
Expected: compiles with no errors. Now commit Task 7's entrypoint too if not yet committed.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/users/users.schemas.ts packages/server/src/users/users.routes.ts
git commit -m "feat(users): admin-only user CRUD routes"
```

---

## Task 10: Integration test harness

**Files:**
- Create: `packages/server/test/helpers.ts`

- [ ] **Step 1: Create the test harness**

```ts
// packages/server/test/helpers.ts
import { beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

// Point Prisma at the dedicated test database BEFORE any module reads it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-only-secret-please-change-me-32chars";

const { prisma } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { hashPassword } = await import("../src/auth/password.js");

export { prisma };

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function resetDb(): Promise<void> {
  // Single table this slice; TRUNCATE is fast and resets nothing else.
  await prisma.user.deleteMany({});
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

export async function seedUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: "EMPLOYEE" | "MANAGER" | "FINANCE" | "ADMIN";
  managerId?: string | null;
  active?: boolean;
}): Promise<SeededUser> {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: await hashPassword(opts.password),
      fullName: opts.fullName,
      role: opts.role,
      managerId: opts.managerId ?? null,
      active: opts.active ?? true,
    },
  });
  return { id: user.id, email: user.email, password: opts.password };
}

// Confirms the test DB is reachable; fails fast with a clear message otherwise.
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Cannot reach TEST database. Ensure Postgres is running and the test DB is migrated (see plan Task 5, Step 5). Original: ${String(err)}`,
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/test/helpers.ts
git commit -m "test(server): integration test harness (build app, reset, seed)"
```

---

## Task 11: Auth API tests (TDD against real routes)

**Files:**
- Test: `packages/server/test/auth.api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/test/auth.api.test.ts
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
  await seedUser({
    email: "admin@example.com",
    password: "password123",
    fullName: "Anna Admin",
    role: "ADMIN",
  });
});

describe("auth", () => {
  it("rejects wrong credentials with 401", async () => {
    const res = await request(app.server)
      .post("/login")
      .send({ email: "admin@example.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("CREDENZIALI_NON_VALIDE");
  });

  it("logs in, sets a session cookie, and serves /me", async () => {
    const agent = request.agent(app.server);
    const login = await agent
      .post("/login")
      .send({ email: "admin@example.com", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe("ADMIN");

    const me = await agent.get("/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("admin@example.com");
  });

  it("returns 401 from /me without a session", async () => {
    const res = await request(app.server).get("/me");
    expect(res.status).toBe(401);
  });

  it("logout clears the session", async () => {
    const agent = request.agent(app.server);
    await agent.post("/login").send({ email: "admin@example.com", password: "password123" });
    await agent.post("/logout");
    const me = await agent.get("/me");
    expect(me.status).toBe(401);
  });

  it("inactive users cannot log in", async () => {
    await seedUser({
      email: "ex@example.com",
      password: "password123",
      fullName: "Ex Dipendente",
      role: "EMPLOYEE",
      active: false,
    });
    const res = await request(app.server)
      .post("/login")
      .send({ email: "ex@example.com", password: "password123" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test --workspace packages/server -- test/auth.api.test.ts`
Expected: PASS (5 tests). Routes from Tasks 6–8 already exist, so this confirms the wiring. If it fails on DB connectivity, complete Task 5 Step 5.

- [ ] **Step 3: Commit**

```bash
git add packages/server/test/auth.api.test.ts
git commit -m "test(auth): login/logout/me API coverage"
```

---

## Task 12: Users API tests — role enforcement & CRUD (TDD)

**Files:**
- Test: `packages/server/test/users.api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/test/users.api.test.ts
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
  await agent.post("/login").send({ email, password });
  return agent;
}

describe("users API", () => {
  it("blocks anonymous access with 401", async () => {
    const res = await request(app.server).get("/users");
    expect(res.status).toBe(401);
  });

  it("blocks non-admins with 403", async () => {
    await seedUser({
      email: "emp@example.com",
      password: "password123",
      fullName: "Elio Dipendente",
      role: "EMPLOYEE",
    });
    const agent = await loginAs("emp@example.com", "password123");
    const res = await agent.get("/users");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NON_AUTORIZZATO");
  });

  it("admin lists, creates, and updates users", async () => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      fullName: "Anna Admin",
      role: "ADMIN",
    });
    const agent = await loginAs("admin@example.com", "password123");

    const created = await agent.post("/users").send({
      email: "mario@example.com",
      password: "password123",
      fullName: "Mario Rossi",
      role: "EMPLOYEE",
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe("EMPLOYEE");
    expect(created.body).not.toHaveProperty("passwordHash");
    const newId = created.body.id;

    const list = await agent.get("/users");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const patched = await agent
      .patch(`/users/${newId}`)
      .send({ role: "MANAGER", active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.role).toBe("MANAGER");
    expect(patched.body.active).toBe(false);
  });

  it("rejects duplicate email with 409", async () => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      fullName: "Anna Admin",
      role: "ADMIN",
    });
    const agent = await loginAs("admin@example.com", "password123");
    const res = await agent.post("/users").send({
      email: "admin@example.com",
      password: "password123",
      fullName: "Dup",
      role: "EMPLOYEE",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("EMAIL_GIA_REGISTRATA");
  });

  it("validates request bodies with 400", async () => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      fullName: "Anna Admin",
      role: "ADMIN",
    });
    const agent = await loginAs("admin@example.com", "password123");
    const res = await agent.post("/users").send({ email: "not-an-email", password: "x" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test --workspace packages/server -- test/users.api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Run the full server suite**

Run: `npm test --workspace packages/server`
Expected: all unit + API tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/test/users.api.test.ts
git commit -m "test(users): role enforcement and CRUD API coverage"
```

---

## Task 13: First-admin bootstrap script

**Files:**
- Create: `packages/server/src/scripts/createAdmin.ts`
- Modify: `packages/server/package.json` (add `create:admin` script)

There must be a way to create the very first admin (no admin exists to call the API). This CLI does it.

- [ ] **Step 1: Create the bootstrap script**

```ts
// packages/server/src/scripts/createAdmin.ts
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";

async function main(): Promise<void> {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ");
  if (!email || !password || !fullName) {
    // eslint-disable-next-line no-console
    console.error('Usage: npm run create:admin -- <email> <password> "<Full Name>"');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.error(`User ${email} already exists`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      role: "ADMIN",
    },
  });
  // eslint-disable-next-line no-console
  console.log(`Created ADMIN ${user.email} (${user.id})`);
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
    "create:admin": "tsx src/scripts/createAdmin.ts"
```

- [ ] **Step 3: Create a dev admin and verify login works end-to-end**

Run:
```bash
npm run create:admin --workspace packages/server -- admin@azienda.it password123 "Anna Admin"
```
Expected: prints `Created ADMIN admin@azienda.it (<id>)`.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/scripts/createAdmin.ts packages/server/package.json
git commit -m "feat(server): first-admin bootstrap CLI"
```

---

## Task 14: Web package scaffold (Vite + React + TS)

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@gsa/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "i18next": "^23.12.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-i18next": "^14.1.2",
    "react-router-dom": "^6.25.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.3",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.5",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "e2e"]
}
```

- [ ] **Step 3: Create `packages/web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to the Fastify server so cookies are same-origin in dev.
    proxy: {
      "/login": "http://localhost:3001",
      "/logout": "http://localhost:3001",
      "/me": "http://localhost:3001",
      "/users": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gestione Spese Aziendali</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `packages/web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import "./i18n.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Install and verify the workspace resolves**

Run: `npm install`
Expected: installs web deps. (`App`, `i18n` created in later tasks — build is deferred to Task 19.)

- [ ] **Step 7: Commit**

```bash
git add packages/web/package.json packages/web/tsconfig.json packages/web/vite.config.ts packages/web/index.html packages/web/src/main.tsx package-lock.json
git commit -m "chore(web): scaffold Vite + React + TS package"
```

---

## Task 15: Italian i18n dictionary

**Files:**
- Create: `packages/web/src/i18n.ts`

- [ ] **Step 1: Create the Italian-only i18n setup**

```ts
// packages/web/src/i18n.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Italian is the only shipped language. The structure leaves room for more
// later, but no English UI is built now (see spec §16).
export const it = {
  translation: {
    app: { title: "Gestione Spese Aziendali" },
    nav: { users: "Utenti", logout: "Esci" },
    login: {
      heading: "Accedi",
      email: "Email",
      password: "Password",
      submit: "Accedi",
      error: "Credenziali non valide",
    },
    roles: {
      EMPLOYEE: "Dipendente",
      MANAGER: "Responsabile",
      FINANCE: "Amministrazione",
      ADMIN: "Amministratore",
    },
    users: {
      title: "Gestione utenti",
      newUser: "Nuovo utente",
      fullName: "Nome e cognome",
      email: "Email",
      role: "Ruolo",
      manager: "Responsabile",
      active: "Attivo",
      noManager: "Nessuno",
      status: { active: "Attivo", inactive: "Disattivato" },
      create: "Crea utente",
      save: "Salva",
      cancel: "Annulla",
      deactivate: "Disattiva",
      activate: "Riattiva",
      empty: "Nessun utente presente.",
      createError: "Impossibile creare l'utente.",
      emailTaken: "Email già registrata.",
    },
    common: { loading: "Caricamento…", required: "Campo obbligatorio" },
  },
};

void i18n.use(initReactI18next).init({
  resources: { it },
  lng: "it",
  fallbackLng: "it",
  interpolation: { escapeValue: false },
});

export default i18n;
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): Italian i18n dictionary"
```

---

## Task 16: it-IT formatters (TDD)

**Files:**
- Create: `packages/web/src/format.ts`
- Test: `packages/web/src/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/format.test.ts
import { describe, it, expect } from "vitest";
import { formatEuroFromCents, formatDateIt } from "./format.js";

describe("it-IT formatters", () => {
  it("formats cents as euro with comma decimals and € symbol", () => {
    // Non-breaking space between number and symbol; assert the parts instead.
    const out = formatEuroFromCents(123456);
    expect(out).toContain("1.234,56");
    expect(out).toContain("€");
  });

  it("formats zero cents", () => {
    expect(formatEuroFromCents(0)).toContain("0,00");
  });

  it("formats an ISO date as gg/MM/aaaa", () => {
    expect(formatDateIt("2026-05-30T10:00:00.000Z")).toBe("30/05/2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/web -- src/format.test.ts`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/web/src/format.ts
const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

export function formatEuroFromCents(cents: number): string {
  return euro.format(cents / 100);
}

export function formatDateIt(iso: string): string {
  return dateFmt.format(new Date(iso));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/web -- src/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/format.ts packages/web/src/format.test.ts
git commit -m "feat(web): it-IT euro and date formatters"
```

---

## Task 17: API client and auth context

**Files:**
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/auth/AuthContext.tsx`

- [ ] **Step 1: Create the fetch wrapper**

```ts
// packages/web/src/api/client.ts
export interface ApiError {
  status: number;
  code?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      code = (await res.json()).error;
    } catch {
      code = undefined;
    }
    const err: ApiError = { status: res.status, code };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

export type Role = "EMPLOYEE" | "MANAGER" | "FINANCE" | "ADMIN";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
```

- [ ] **Step 2: Create the auth context**

```tsx
// packages/web/src/auth/AuthContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type CurrentUser } from "../api/client.js";

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CurrentUser>("/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const u = await api.post<CurrentUser>("/login", { email, password });
    setUser(u);
  }

  async function logout(): Promise<void> {
    await api.post("/logout");
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/auth/AuthContext.tsx
git commit -m "feat(web): API client and auth context"
```

---

## Task 18: Login and Users pages (Italian UI)

**Files:**
- Create: `packages/web/src/pages/LoginPage.tsx`
- Create: `packages/web/src/pages/UsersPage.tsx`

- [ ] **Step 1: Create the login page**

```tsx
// packages/web/src/pages/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.js";

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", fontFamily: "system-ui" }}>
      <h1>{t("app.title")}</h1>
      <h2>{t("login.heading")}</h2>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("login.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("login.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>
        {error && <p role="alert" style={{ color: "#dc2626" }}>{t("login.error")}</p>}
        <button type="submit" disabled={busy}>
          {t("login.submit")}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Create the users management page**

```tsx
// packages/web/src/pages/UsersPage.tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type Role } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
  active: boolean;
}

const ROLE_OPTIONS: Role[] = ["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"];

export function UsersPage(): JSX.Element {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // New-user form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [managerId, setManagerId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<UserRow[]>("/users");
    setUsers(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);
    try {
      await api.post("/users", {
        fullName,
        email,
        password,
        role,
        managerId: managerId || null,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setManagerId("");
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setFormError(code === "EMAIL_GIA_REGISTRATA" ? t("users.emailTaken") : t("users.createError"));
    }
  }

  async function toggleActive(u: UserRow): Promise<void> {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await refresh();
  }

  const managers = users.filter((u) => u.role === "MANAGER" || u.role === "ADMIN");

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("users.title")}</h1>
        <div>
          <span style={{ marginRight: 12 }}>{user?.fullName}</span>
          <button onClick={() => void logout()}>{t("nav.logout")}</button>
        </div>
      </header>

      <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2>{t("users.newUser")}</h2>
        <form onSubmit={onCreate} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <input placeholder={t("users.fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <input type="email" placeholder={t("users.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder={t("login.password")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{t(`roles.${r}`)}</option>
            ))}
          </select>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">{t("users.noManager")}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName}</option>
            ))}
          </select>
          {formError && <p role="alert" style={{ color: "#dc2626" }}>{formError}</p>}
          <button type="submit">{t("users.create")}</button>
        </form>
      </section>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p>{t("users.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("users.fullName")}</th>
              <th style={{ textAlign: "left" }}>{t("users.email")}</th>
              <th style={{ textAlign: "left" }}>{t("users.role")}</th>
              <th style={{ textAlign: "left" }}>{t("users.active")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{t(`roles.${u.role}`)}</td>
                <td>{u.active ? t("users.status.active") : t("users.status.inactive")}</td>
                <td>
                  <button onClick={() => void toggleActive(u)}>
                    {u.active ? t("users.deactivate") : t("users.activate")}
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

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/LoginPage.tsx packages/web/src/pages/UsersPage.tsx
git commit -m "feat(web): Italian login and user-management pages"
```

---

## Task 19: App router with auth gate

**Files:**
- Create: `packages/web/src/App.tsx`

- [ ] **Step 1: Create the App component**

```tsx
// packages/web/src/App.tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";

function Routed(): JSX.Element {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/utenti" replace /> : <LoginPage />} />
      <Route path="/utenti" element={user ? <UsersPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? "/utenti" : "/login"} replace />} />
    </Routes>
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

- [ ] **Step 2: Verify the web app builds and type-checks**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` passes and Vite produces `dist/`. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): router with login/users auth gate"
```

---

## Task 20: E2E happy path (Playwright)

**Files:**
- Create: `packages/web/playwright.config.ts`
- Test: `packages/web/e2e/login.spec.ts`

This test drives the real UI against the real server. It assumes the server and web dev server are running and a dev admin exists (Task 13).

- [ ] **Step 1: Create the Playwright config**

```ts
// packages/web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
    locale: "it-IT",
  },
});
```

- [ ] **Step 2: Install the Playwright browser**

Run: `npx playwright install chromium --workspace packages/web` (or from `packages/web`: `npx playwright install chromium`)
Expected: Chromium downloaded.

- [ ] **Step 3: Write the E2E test**

```ts
// packages/web/e2e/login.spec.ts
import { test, expect } from "@playwright/test";

// Requires: server on :3001, web on :5173, and a dev admin
// admin@azienda.it / password123 created via `npm run create:admin`.
test("admin logs in and sees the Italian user-management page", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();

  await page.getByLabel("Email").fill("admin@azienda.it");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();

  await expect(page.getByRole("heading", { name: "Gestione utenti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esci" })).toBeVisible();
});
```

- [ ] **Step 4: Run the E2E test**

Run (in three terminals or background the first two):
```bash
# terminal 1
npm run dev:server
# terminal 2
npm run dev:web
# terminal 3
npm run e2e --workspace packages/web
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/e2e/login.spec.ts
git commit -m "test(web): E2E admin login happy path"
```

---

## Task 21: Slice verification & README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: server unit + API tests and web unit tests all PASS.

- [ ] **Step 2: Write a `README.md` with setup + run instructions**

```markdown
# Gestione Spese Aziendali

Sistema di gestione delle note spese aziendali. (UI in italiano; codice e API in inglese.)

## Requisiti
- Node 20+
- PostgreSQL in esecuzione su localhost:5432

## Setup
1. `cp .env.example packages/server/.env` e regola le credenziali del DB.
2. Crea i database: `gestione_spese` e `gestione_spese_test`.
3. `npm install`
4. `npm run prisma:migrate --workspace packages/server` (dev DB)
5. Applica le migration al DB di test (vedi piano Task 5).
6. Crea il primo amministratore:
   `npm run create:admin --workspace packages/server -- admin@azienda.it password123 "Anna Admin"`

## Avvio in sviluppo
- API: `npm run dev:server` (porta 3001)
- Web: `npm run dev:web` (porta 5173)

## Test
- Tutto: `npm test`
- Server: `npm test --workspace packages/server`
- Web: `npm test --workspace packages/web`
- E2E: `npm run e2e --workspace packages/web` (richiede server + web attivi)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: project README and setup instructions"
```

---

## Self-Review

**1. Spec coverage (Slice 1 scope):**
- §3 Roles (four roles, `managerId`) → Task 3 (`ROLES`), Task 5 (`User.role`, `managerId`), Task 9 (assign role/manager). ✓
- §10 Authentication (email+password, hashed, session, admin creates users) → Task 4 (hash), Task 6 (session), Task 8 (login/logout/me), Task 9 (admin creates), Task 13 (first admin). ✓
- §11 Tech stack (Fastify, Prisma, Postgres, React, Vite, Vitest, Supertest, Playwright) → Tasks 2, 5, 14, 20. ✓
- §12 Structure (`core/` pure, thin Fastify wrappers) → Task 3 (`core/roles.ts` pure), routes call into it. ✓
- §15 Testing (unit on core, API via Supertest, thin E2E) → Tasks 3/4/16 (unit), 11/12 (API), 20 (E2E). ✓
- §16 Localization (Italian-only UI, centralized strings, it-IT formatting, Italian role/labels; English code/enums) → Tasks 15, 16, 18, 19; enums stay English in Prisma/core. ✓
- Out-of-scope items (OCR, multi-tenancy, SSO) are not introduced. ✓
- Deferred to later slices (correctly absent here): expense reports, items, state machine, ACI, vehicles, mileage, payment, CSV export. These are Slices 2–4.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step contains complete code; commands include expected output. ✓

**3. Type consistency:** `Role` is defined once in `core/roles.ts` (server) and mirrored as a string union in `web/api/client.ts`; `SessionUser` ({id, role}) is what `/login` sets and `requireAuth`/`requireRole` read; `publicSelect` never returns `passwordHash` (asserted in Task 12); `buildTestApp`/`resetDb`/`seedUser` signatures in Task 10 match their use in Tasks 11–12; i18n keys used in pages (Task 18) all exist in the dictionary (Task 15: `roles.*`, `users.*`, `login.*`, `nav.*`, `common.*`). ✓
```

