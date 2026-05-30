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
  await seedUser({
    email: "admin@example.com",
    password: "password123",
    fullName: "Anna Admin",
    role: "ADMIN",
  });
});

describe("auth", () => {
  it("rejects wrong credentials with 401", async () => {
    const res = await request(app.server)
      .post("/api/login")
      .send({ email: "admin@example.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("CREDENZIALI_NON_VALIDE");
  });

  it("logs in, sets a session cookie, and serves /me", async () => {
    const agent = request.agent(app.server);
    const login = await agent
      .post("/api/login")
      .send({ email: "admin@example.com", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe("ADMIN");
    expect(login.body).not.toHaveProperty("passwordHash");

    const me = await agent.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("admin@example.com");
  });

  it("returns 401 from /me without a session", async () => {
    const res = await request(app.server).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("logout clears the session", async () => {
    const agent = request.agent(app.server);
    await agent.post("/api/login").send({ email: "admin@example.com", password: "password123" });
    await agent.post("/api/logout");
    const me = await agent.get("/api/me");
    expect(me.status).toBe(401);
  });

  it("inactive users cannot log in", async () => {
    await seedUser({
      email: "ex@example.com",
      password: "password123",
      fullName: "Ex Dipendente",
      role: "EMPLOYEE",
      active: false,
    });
    const res = await request(app.server)
      .post("/api/login")
      .send({ email: "ex@example.com", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("rate-limits repeated login attempts with 429", async () => {
    const { buildApp } = await import("../src/app.js");
    const limited = await buildApp({ loginRateMax: 3 });
    await limited.ready();
    try {
      const attempt = () =>
        request(limited.server)
          .post("/api/login")
          .send({ email: "admin@example.com", password: "wrong" });
      // First 3 are allowed (401 wrong creds); the 4th is blocked (429).
      await attempt();
      await attempt();
      await attempt();
      const fourth = await attempt();
      expect(fourth.status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
