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

  it("employee cannot access approvals scope (403)", async () => {
    await seedOrg();
    const emp = await loginAs("emp@example.com", "password123");
    const res = await emp.get("/api/reports?scope=approvals");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NON_AUTORIZZATO");
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
