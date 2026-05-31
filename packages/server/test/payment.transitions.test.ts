import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, seedReport, prisma } from "./helpers.js";

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

async function seedCast() {
  const manager = await seedUser({ email: "m@x.it", password: "password123", fullName: "M", role: "MANAGER" });
  const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "E", role: "EMPLOYEE", managerId: manager.id });
  const finance = await seedUser({ email: "f@x.it", password: "password123", fullName: "F", role: "FINANCE" });
  return { manager, emp, finance };
}

describe("POST /reports/:id/send-payment", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).post("/api/reports/x/send-payment").send();
    expect(res.status).toBe(401);
  });

  it("lets finance move an APPROVED report to SENT_FOR_PAYMENT", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "APPROVED" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/send-payment`).send();
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("SENT_FOR_PAYMENT");
  });

  it("forbids a non-finance user (403)", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "APPROVED" });
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/send-payment`).send();
    expect(res.status).toBe(403);
  });

  it("rejects an illegal state with 409", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "CREATED" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/send-payment`).send();
    expect(res.status).toBe(409);
  });

  it("returns 404 for a missing report", async () => {
    await seedCast();
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.post(`/api/reports/nope/send-payment`).send();
    expect(res.status).toBe(404);
  });
});

describe("POST /reports/:id/mark-paid", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).post("/api/reports/x/mark-paid").send({});
    expect(res.status).toBe(401);
  });

  it("records paidAt and paymentReference", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent
      .post(`/api/reports/${report.id}/mark-paid`)
      .send({ paidAt: "2026-05-20", paymentReference: "BON-9" });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("PAID");
    const row = await prisma.expenseReport.findUnique({ where: { id: report.id } });
    expect(row?.paymentReference).toBe("BON-9");
    expect(row?.paidAt?.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("defaults paidAt to now and stores a null reference when omitted", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("f@x.it", "password123");
    const before = Date.now();
    const res = await agent.post(`/api/reports/${report.id}/mark-paid`).send({});
    expect(res.status).toBe(200);
    const row = await prisma.expenseReport.findUnique({ where: { id: report.id } });
    expect(row?.paymentReference).toBeNull();
    expect(row?.paidAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(row?.paidAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("trims a blank reference to null", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("f@x.it", "password123");
    await agent.post(`/api/reports/${report.id}/mark-paid`).send({ paymentReference: "   " });
    const row = await prisma.expenseReport.findUnique({ where: { id: report.id } });
    expect(row?.paymentReference).toBeNull();
  });

  it("rejects an invalid date with 400", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/mark-paid`).send({ paidAt: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rejects a wrong-state report with 409", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "APPROVED" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/mark-paid`).send({});
    expect(res.status).toBe(409);
  });

  it("forbids a non-finance user (403)", async () => {
    const { emp } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("m@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/mark-paid`).send({});
    expect(res.status).toBe(403);
  });
});

describe("GET /reports?scope=payments", () => {
  it("returns the payable states to finance across owners", async () => {
    const { emp } = await seedCast();
    await seedReport({ ownerId: emp.id, state: "CREATED" });
    await seedReport({ ownerId: emp.id, state: "APPROVED" });
    await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    await seedReport({ ownerId: emp.id, state: "PAID" });
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.get("/api/reports?scope=payments");
    expect(res.status).toBe(200);
    const states = (res.body as Array<{ state: string }>).map((r) => r.state).sort();
    expect(states).toEqual(["APPROVED", "PAID", "SENT_FOR_PAYMENT"]);
  });

  it("forbids a non-finance user (403)", async () => {
    const { emp } = await seedCast();
    await seedReport({ ownerId: emp.id, state: "APPROVED" });
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.get("/api/reports?scope=payments");
    expect(res.status).toBe(403);
  });
});
