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
  await agent.post("/api/login").send({ email, password });
  return agent;
}

describe("mileage tolerance setting", () => {
  it("returns the default (10) when unset", async () => {
    await seedUser({ email: "emp@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const emp = await loginAs("emp@x.it", "password123");
    const res = await emp.get("/api/settings/mileage-tolerance");
    expect(res.status).toBe(200);
    expect(res.body.tolerancePercent).toBe(10);
  });

  it("lets an admin set it and reflects the new value", async () => {
    await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const admin = await loginAs("a@x.it", "password123");

    const put = await admin.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 15 });
    expect(put.status).toBe(200);
    expect(put.body.tolerancePercent).toBe(15);

    const get = await admin.get("/api/settings/mileage-tolerance");
    expect(get.body.tolerancePercent).toBe(15);
  });

  it("forbids a non-admin from setting it (403)", async () => {
    await seedUser({ email: "emp@x.it", password: "password123", fullName: "E", role: "EMPLOYEE" });
    const emp = await loginAs("emp@x.it", "password123");
    const res = await emp.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 20 });
    expect(res.status).toBe(403);
  });

  it("rejects an out-of-range value (400)", async () => {
    await seedUser({ email: "a@x.it", password: "password123", fullName: "A", role: "ADMIN" });
    const admin = await loginAs("a@x.it", "password123");
    const res = await admin.put("/api/settings/mileage-tolerance").send({ tolerancePercent: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DATI_NON_VALIDI");
  });
});
