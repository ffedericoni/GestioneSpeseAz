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

describe("users API", () => {
  it("blocks anonymous access with 401", async () => {
    const res = await request(app.server).get("/api/users");
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
    const res = await agent.get("/api/users");
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

    const created = await agent.post("/api/users").send({
      email: "mario@example.com",
      password: "password123",
      fullName: "Mario Rossi",
      role: "EMPLOYEE",
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe("EMPLOYEE");
    expect(created.body).not.toHaveProperty("passwordHash");
    const newId = created.body.id;

    const list = await agent.get("/api/users");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const patched = await agent
      .patch(`/api/users/${newId}`)
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
    const res = await agent.post("/api/users").send({
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
    const res = await agent.post("/api/users").send({ email: "not-an-email", password: "x" });
    expect(res.status).toBe(400);
  });

  it("clears managerId when PATCH sets it to null, preserves when omitted", async () => {
    const mgr = await seedUser({
      email: "mgr@example.com", password: "password123", fullName: "Maria Manager", role: "MANAGER",
    });
    await seedUser({
      email: "admin@example.com", password: "password123", fullName: "Anna Admin", role: "ADMIN",
    });
    const agent = await loginAs("admin@example.com", "password123");
    const created = await agent.post("/api/users").send({
      email: "sub@example.com", password: "password123", fullName: "Subordinato", role: "EMPLOYEE", managerId: mgr.id,
    });
    expect(created.body.managerId).toBe(mgr.id);
    const id = created.body.id;

    // Omitting managerId preserves it
    const p1 = await agent.patch(`/api/users/${id}`).send({ fullName: "Subordinato B" });
    expect(p1.body.managerId).toBe(mgr.id);

    // Explicit null clears it
    const p2 = await agent.patch(`/api/users/${id}`).send({ managerId: null });
    expect(p2.body.managerId).toBeNull();
  });
});
