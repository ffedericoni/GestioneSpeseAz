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

  it("returns 400 (not 500) for a non-multipart request", async () => {
    await seedAdminAndEmployee();
    const admin = await loginAs("admin@example.com", "password123");
    const res = await admin.post("/api/aci/import").send({ not: "multipart" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });
});

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
