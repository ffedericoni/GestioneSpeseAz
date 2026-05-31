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

describe("mileage item create", () => {
  async function setup() {
    const admin = await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const rate = await seedAciRate({ importedById: admin.id, costPerKm: "0.6543" });
    const veh = await seedVehicle({ userId: emp.id, aciRateId: rate.id });
    const report = await seedReport({ ownerId: emp.id, state: "CREATED" });
    const agent = await loginAs("e@x.it", "password123");
    return { emp, rate, veh, report, agent };
  }

  it("computes amountCents from the rate and snapshots the inputs", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Milano-Torino",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(6543);
    expect(res.body.category).toBe("MILEAGE");

    const item = await prisma.expenseItem.findUnique({ where: { id: res.body.id } });
    expect(item?.baselineKm).toBe(100);
    expect(item?.enteredKm).toBe(100);
    expect(item?.tolerancePercent).toBe(10);
    expect(item?.ratePerKm?.toString()).toBe("0.6543");
    expect(item?.routeProvider).toBe("MANUAL");
    expect(item?.vehicleId).toBe(veh.id);
  });

  it("ignores any client-supplied amountCents and recomputes", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Tentativo",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
      amountCents: 999999,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(6543);
  });

  it("rejects km over the upper bound without a justification", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Troppi km",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 200,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("accepts km over the upper bound with a justification and stores it", async () => {
    const { veh, report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Deviazione",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 200,
      overageJustification: "Strada chiusa, deviazione obbligata",
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(13086);
    const item = await prisma.expenseItem.findUnique({ where: { id: res.body.id } });
    expect(item?.overageJustification).toBe("Strada chiusa, deviazione obbligata");
  });

  it("rejects a MILEAGE body that is missing required mileage fields with 400", async () => {
    const { report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Incompleto",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("rejects a MILEAGE body whose vehicle belongs to someone else with 400", async () => {
    const { report, agent } = await setup();
    const admin2 = await seedUser({ email: "a2@x.it", password: "password123", fullName: "A2", role: "ADMIN" });
    const other = await seedUser({ email: "o2@x.it", password: "password123", fullName: "O2", role: "EMPLOYEE" });
    const rate2 = await seedAciRate({ importedById: admin2.id, make: "Audi" });
    const otherVeh = await seedVehicle({ userId: other.id, aciRateId: rate2.id });
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Veicolo altrui",
      vehicleId: otherVeh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });

  it("keeps the snapshot stable when the tolerance setting later changes", async () => {
    const { veh, report, agent } = await setup();
    const created = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "MILEAGE",
      date: "2026-05-20",
      description: "Snapshot",
      vehicleId: veh.id,
      originAddress: "Milano",
      destinationAddress: "Torino",
      roundTrip: false,
      manualKm: 100,
      enteredKm: 100,
    });
    expect(created.body.amountCents).toBe(6543);

    const adminAgent = await loginAs("a@x.it", "password123");
    await adminAgent.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 50 });

    const item = await prisma.expenseItem.findUnique({ where: { id: created.body.id } });
    expect(item?.tolerancePercent).toBe(10);
    expect(item?.amountCents).toBe(6543);
  });

  it("creates a money item unaffected by the union", async () => {
    const { report, agent } = await setup();
    const res = await agent.post(`/api/reports/${report.id}/items`).send({
      category: "TRANSPORT",
      date: "2026-05-20",
      description: "Treno",
      amountCents: 2500,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(2500);
  });
});
