import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, resetDb, seedUser, seedReport, seedItem, prisma } from "./helpers.js";

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

async function seedData() {
  const finance = await seedUser({ email: "f@x.it", password: "password123", fullName: "Franca", role: "FINANCE" });
  const emp = await seedUser({ email: "e@x.it", password: "password123", fullName: "Elsa", role: "EMPLOYEE" });
  const approved = await seedReport({ ownerId: emp.id, title: "Trasferta A", state: "APPROVED" });
  await seedItem({ reportId: approved.id, description: "Treno", amountCents: 4500 });
  const paid = await seedReport({ ownerId: emp.id, title: "Trasferta B", state: "PAID" });
  await seedItem({ reportId: paid.id, description: "Hotel", amountCents: 9000 });
  await prisma.expenseReport.update({
    where: { id: paid.id },
    data: { paidAt: new Date("2026-05-03T00:00:00.000Z"), paymentReference: "BON-1", totalCents: 9000 },
  });
  await prisma.expenseReport.update({ where: { id: approved.id }, data: { totalCents: 4500 } });
  return { finance, emp };
}

describe("GET /reports/export/reports.csv", () => {
  it("requires authentication", async () => {
    const res = await request(app.server).get("/api/reports/export/reports.csv");
    expect(res.status).toBe(401);
  });

  it("forbids a non-finance user (403)", async () => {
    await seedData();
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.get("/api/reports/export/reports.csv");
    expect(res.status).toBe(403);
  });

  it("returns a CSV attachment with the BOM, Italian headers and the payable rows", async () => {
    await seedData();
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.get("/api/reports/export/reports.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".csv");
    expect(res.text.startsWith("﻿")).toBe(true);
    const lines = res.text.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Titolo;Stato;Totale;Data invio;Data decisione;Data pagamento;Riferimento pagamento;N. voci",
    );
    expect(res.text).toContain("Trasferta A");
    expect(res.text).toContain("Trasferta B");
    expect(res.text).toContain("BON-1");
  });

  it("filters by ?state=PAID", async () => {
    await seedData();
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.get("/api/reports/export/reports.csv?state=PAID");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Trasferta B");
    expect(res.text).not.toContain("Trasferta A");
  });

  it("rejects an invalid ?state with 400", async () => {
    await seedData();
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.get("/api/reports/export/reports.csv?state=BOGUS");
    expect(res.status).toBe(400);
  });
});

describe("GET /reports/export/items.csv", () => {
  it("returns one row per item with Italian item headers", async () => {
    await seedData();
    const agent = await loginAs("f@x.it", "password123");
    const res = await agent.get("/api/reports/export/items.csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.text.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Nota spese;Stato nota;Data;Categoria;Descrizione;Importo;IVA;Km percorsi;Tariffa €/km;Veicolo;Giustificazione;Note",
    );
    expect(res.text).toContain("Treno");
    expect(res.text).toContain("Hotel");
  });

  it("forbids a non-finance user (403)", async () => {
    await seedData();
    const agent = await loginAs("e@x.it", "password123");
    const res = await agent.get("/api/reports/export/items.csv");
    expect(res.status).toBe(403);
  });
});
