import { beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";

// Point Prisma at the dedicated test database BEFORE the db module is imported.
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

// Fail fast with a clear message if the test DB is unreachable.
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Cannot reach TEST database. Ensure Postgres is running and the test DB is migrated. Original: ${String(err)}`,
    );
  }
});
