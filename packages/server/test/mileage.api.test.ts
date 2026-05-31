import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, seedAciRate, seedVehicle, seedReport, prisma } from "./helpers.js";

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

describe("mileage quote", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).post("/api/items/mileage/quote").send({});
    expect(res.status).toBe(401);
  });

  it("returns baseline, upper bound, tolerance and rate for an owned vehicle", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id, costPerKm: "0.6543" });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });

    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      baselineKm: 100,
      upperBoundKm: 110,
      tolerancePercent: 10,
      ratePerKm: "0.6543",
    });
  });

  it("doubles the baseline for a round trip", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });

    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: true,
      manualKm: 100,
    });
    expect(res.status).toBe(200);
    expect(res.body.baselineKm).toBe(200);
    expect(res.body.upperBoundKm).toBe(220);
  });

  it("returns 404 VEICOLO_NON_TROVATO for another user's vehicle", async () => {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const owner = await seedUser({ email: "o@x.it", password: "password123", fullName: "O", role: "EMPLOYEE" });
    await seedUser({ email: "other@x.it", password: "password123", fullName: "Other", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id });
    const veh = await seedVehicle({ userId: owner.id, aciRateId: rate.id });

    const agent = await loginAs("other@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("VEICOLO_NON_TROVATO");
  });

  it("rejects an invalid body with 400", async () => {
    await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post("/api/items/mileage/quote").send({ vehicleId: "x", manualKm: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });
});
