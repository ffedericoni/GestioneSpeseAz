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
