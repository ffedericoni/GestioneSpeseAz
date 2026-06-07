import { beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ReportState, Category } from "@gsa/shared";

// Point Prisma at the dedicated test database BEFORE the db module is imported.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-only-secret-please-change-me-32chars";
// Keep the login rate limiter effectively disabled for the suite; a dedicated
// test builds its own app with a low limit to verify 429 behaviour.
process.env.LOGIN_RATE_MAX = process.env.LOGIN_RATE_MAX ?? "100000";

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
  // TRUNCATE ... CASCADE handles all FK constraints automatically regardless of
  // insertion order, and is more robust than ordered deleteMany chains when the
  // DB has accumulated state from previous test runs.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "ReportEvent", "ExpenseItem", "ExpenseReport", "Vehicle", "AciRate", "AciImportBatch", "Setting", "User" CASCADE`,
  );
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
