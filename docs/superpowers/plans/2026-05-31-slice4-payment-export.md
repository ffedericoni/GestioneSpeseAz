# Slice 4 — Payment & CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the two Finance state transitions (`send-payment`, `mark-paid`) with payment metadata, give Finance a payments-queue UI, and add report-level and item-level CSV exports for accounting.

**Architecture:** The state-machine transitions already exist in `@gsa/shared`; this slice only adds the HTTP endpoints, a pure CSV builder in the server (`src/payment/`), a Finance scope on the reports list, and the React UI. No Prisma migration is needed — `ExpenseReport.paidAt` and `paymentReference` already exist. Money stays integer cents end to end; CSV formats to Italian decimal strings only at the export boundary.

**Tech Stack:** TypeScript, Fastify 4 + Prisma 5 (PostgreSQL), Zod, React 18 + Vite 5 + react-i18next, Vitest + supertest (server), Playwright (E2E).

**Conventions (read before starting):**
- Web UI is **entirely Italian**; backend identifiers/enums/errors are English.
- Pure server logic lives in focused modules with co-located `*.test.ts`; web pages have **no** unit tests (verified by `tsc -b && vite build` + Playwright).
- Italian error codes: `NON_AUTENTICATO` (401), `NON_AUTORIZZATO` (403), `DATI_NON_VALIDI` (400), `NOTA_SPESE_NON_TROVATA` (404). Transition errors map `NON_AUTORIZZATO`→403, `TRANSIZIONE_NON_VALIDA`→409.
- **Never** commit `.env`. Verify `git status` before every commit.
- Run server tests with `npm test --workspace packages/server` (append a filename fragment to filter, e.g. `-- payment.transitions`).

---

## File Structure

**Server (create):**
- `packages/server/src/payment/csv.ts` — pure CSV builder + Italian formatters + label maps.
- `packages/server/src/payment/csv.test.ts` — unit tests for the pure builder.
- `packages/server/src/payment/payment.routes.ts` — the two CSV export endpoints.
- `packages/server/test/payment.transitions.test.ts` — API tests for send-payment, mark-paid, `?scope=payments`.
- `packages/server/test/payment.export.test.ts` — API tests for the CSV endpoints.

**Server (modify):**
- `packages/server/src/reports/reports.schemas.ts` — add `markPaidSchema`.
- `packages/server/src/reports/reports.service.ts` — `performTransition` gains a `payment?` arg.
- `packages/server/src/reports/reports.routes.ts` — two transition endpoints + `?scope=payments`.
- `packages/server/src/app.ts` — register `paymentRoutes`.
- `packages/server/src/scripts/seedDev.ts` — add the FINANCE user.

**Web (create):**
- `packages/web/src/components/MarkPaidForm.tsx` — date + reference mini-form (shared).
- `packages/web/src/pages/PagamentiPage.tsx` — Finance payments queue.
- `packages/web/e2e/payment.spec.ts` — happy-path E2E.

**Web (modify):**
- `packages/web/src/api/client.ts` — `sendPayment`, `markPaid`, `exportCsvUrl`.
- `packages/web/src/i18n.ts` — `nav.payments`, `payments.*`, `reports.sendPayment/markPaid`.
- `packages/web/src/components/NavBar.tsx` — Pagamenti link.
- `packages/web/src/App.tsx` — `/pagamenti` route.
- `packages/web/src/pages/ReportDetailPage.tsx` — payment buttons + form.

**Docs:** `README.md`.

---

## Task 1: Pure CSV builder (server core, TDD)

**Files:**
- Create: `packages/server/src/payment/csv.ts`
- Test: `packages/server/src/payment/csv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/payment/csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toCsv,
  formatEuroCents,
  formatItDate,
  buildReportCsv,
  buildItemCsv,
} from "./csv.js";

describe("toCsv", () => {
  it("joins fields with ; and rows with CRLF and prefixes a UTF-8 BOM", () => {
    const out = toCsv([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(out).toBe("﻿a;b\r\nc;d");
  });

  it("quotes fields containing the delimiter, quotes or newlines and doubles inner quotes", () => {
    const out = toCsv([["plain", "has;semi", 'has"quote', "has\nnewline"]]);
    expect(out).toBe('﻿plain;"has;semi";"has""quote";"has\nnewline"');
  });
});

describe("formatEuroCents", () => {
  it("formats integer cents as Italian decimals without thousands separators", () => {
    expect(formatEuroCents(6543)).toBe("65,43");
    expect(formatEuroCents(100000)).toBe("1000,00");
    expect(formatEuroCents(5)).toBe("0,05");
    expect(formatEuroCents(0)).toBe("0,00");
  });
});

describe("formatItDate", () => {
  it("formats a date as gg/MM/aaaa (UTC) and null as empty", () => {
    expect(formatItDate(new Date("2026-05-20T00:00:00.000Z"))).toBe("20/05/2026");
    expect(formatItDate(null)).toBe("");
  });
});

describe("buildReportCsv", () => {
  it("emits the Italian header row then one row per report", () => {
    const csv = buildReportCsv([
      {
        ownerName: "Elsa Dipendente",
        title: "Trasferta",
        state: "PAID",
        totalCents: 6543,
        submittedAt: new Date("2026-05-01T00:00:00.000Z"),
        decidedAt: new Date("2026-05-02T00:00:00.000Z"),
        paidAt: new Date("2026-05-03T00:00:00.000Z"),
        paymentReference: "BON-123",
        itemCount: 2,
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Titolo;Stato;Totale;Data invio;Data decisione;Data pagamento;Riferimento pagamento;N. voci",
    );
    expect(lines[1]).toBe(
      "Elsa Dipendente;Trasferta;Pagata;65,43;01/05/2026;02/05/2026;03/05/2026;BON-123;2",
    );
  });

  it("emits only the header for an empty set", () => {
    const csv = buildReportCsv([]);
    expect(csv.replace("﻿", "")).toBe(
      "Dipendente;Titolo;Stato;Totale;Data invio;Data decisione;Data pagamento;Riferimento pagamento;N. voci",
    );
  });
});

describe("buildItemCsv", () => {
  it("emits Italian headers and leaves mileage columns empty for money items", () => {
    const csv = buildItemCsv([
      {
        ownerName: "Elsa Dipendente",
        reportTitle: "Trasferta",
        reportState: "APPROVED",
        date: new Date("2026-05-20T00:00:00.000Z"),
        category: "TRANSPORT",
        description: "Treno",
        amountCents: 4500,
        vatCents: null,
        enteredKm: null,
        ratePerKm: null,
        vehicleLabel: null,
        overageJustification: null,
        notes: null,
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Nota spese;Stato nota;Data;Categoria;Descrizione;Importo;IVA;Km percorsi;Tariffa €/km;Veicolo;Giustificazione;Note",
    );
    expect(lines[1]).toBe(
      "Elsa Dipendente;Trasferta;Approvata;20/05/2026;Trasporti;Treno;45,00;;;;;;",
    );
  });

  it("fills mileage columns for a mileage item", () => {
    const csv = buildItemCsv([
      {
        ownerName: "Elsa",
        reportTitle: "Giro",
        reportState: "PAID",
        date: new Date("2026-05-20T00:00:00.000Z"),
        category: "MILEAGE",
        description: "Milano-Torino",
        amountCents: 6543,
        vatCents: null,
        enteredKm: 100,
        ratePerKm: "0.6543",
        vehicleLabel: "Auto",
        overageJustification: null,
        notes: null,
      },
    ]);
    const row = csv.replace("﻿", "").split("\r\n")[1];
    expect(row).toBe("Elsa;Giro;Pagata;20/05/2026;Rimborso chilometrico;Milano-Torino;65,43;;100;0.6543;Auto;;");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- payment/csv`
Expected: FAIL — cannot resolve `./csv.js` / functions not defined.

- [ ] **Step 3: Implement the pure module**

Create `packages/server/src/payment/csv.ts`:

```ts
// Pure CSV builder for the accounting export. Framework- and I/O-free.
// Italian Excel conventions: ';' delimiter, decimal comma, CRLF lines, UTF-8 BOM.
import type { ReportState, Category } from "@gsa/shared";

const STATE_LABELS: Record<ReportState, string> = {
  CREATED: "Bozza",
  READY_FOR_APPROVAL: "Da approvare",
  IN_REVISION: "In revisione",
  APPROVED: "Approvata",
  REJECTED: "Respinta",
  SENT_FOR_PAYMENT: "Inviata al pagamento",
  PAID: "Pagata",
};

const CATEGORY_LABELS: Record<Category, string> = {
  MILEAGE: "Rimborso chilometrico",
  MEALS_LODGING: "Vitto e alloggio",
  TRANSPORT: "Trasporti",
  OTHER: "Altro",
};

// Italian decimal, two places, comma separator, NO thousands separator and NO
// currency symbol (keeps the column machine-parseable for the accounting import).
export function formatEuroCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${euros},${rem.toString().padStart(2, "0")}`;
}

// gg/MM/aaaa using UTC components (item/report dates are stored at midnight UTC,
// so UTC getters yield the intended calendar day regardless of server timezone).
export function formatItDate(date: Date | null): string {
  if (!date) return "";
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

const BOM = "﻿";

// A field needs quoting iff it contains the delimiter, a quote, or a newline.
function escapeField(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(escapeField).join(";")).join("\r\n");
}

export interface ReportExportRow {
  ownerName: string;
  title: string;
  state: ReportState;
  totalCents: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentReference: string | null;
  itemCount: number;
}

const REPORT_HEADERS = [
  "Dipendente",
  "Titolo",
  "Stato",
  "Totale",
  "Data invio",
  "Data decisione",
  "Data pagamento",
  "Riferimento pagamento",
  "N. voci",
];

export function buildReportCsv(rows: ReportExportRow[]): string {
  const body = rows.map((r) => [
    r.ownerName,
    r.title,
    STATE_LABELS[r.state],
    formatEuroCents(r.totalCents),
    formatItDate(r.submittedAt),
    formatItDate(r.decidedAt),
    formatItDate(r.paidAt),
    r.paymentReference ?? "",
    String(r.itemCount),
  ]);
  return toCsv([REPORT_HEADERS, ...body]);
}

export interface ItemExportRow {
  ownerName: string;
  reportTitle: string;
  reportState: ReportState;
  date: Date;
  category: Category;
  description: string;
  amountCents: number;
  vatCents: number | null;
  enteredKm: number | null;
  ratePerKm: string | null;
  vehicleLabel: string | null;
  overageJustification: string | null;
  notes: string | null;
}

const ITEM_HEADERS = [
  "Dipendente",
  "Nota spese",
  "Stato nota",
  "Data",
  "Categoria",
  "Descrizione",
  "Importo",
  "IVA",
  "Km percorsi",
  "Tariffa €/km",
  "Veicolo",
  "Giustificazione",
  "Note",
];

export function buildItemCsv(rows: ItemExportRow[]): string {
  const body = rows.map((r) => [
    r.ownerName,
    r.reportTitle,
    STATE_LABELS[r.reportState],
    formatItDate(r.date),
    CATEGORY_LABELS[r.category],
    r.description,
    formatEuroCents(r.amountCents),
    r.vatCents == null ? "" : formatEuroCents(r.vatCents),
    r.enteredKm == null ? "" : String(r.enteredKm),
    r.ratePerKm ?? "",
    r.vehicleLabel ?? "",
    r.overageJustification ?? "",
    r.notes ?? "",
  ]);
  return toCsv([ITEM_HEADERS, ...body]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace packages/server -- payment/csv`
Expected: PASS (all `csv.test.ts` cases green).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/payment/csv.ts packages/server/src/payment/csv.test.ts
git status --short   # confirm no .env staged
git commit -m "feat(server): pure CSV builder for accounting export"
```

---

## Task 2: Payment transitions + `markPaidSchema` + service (TDD)

**Files:**
- Create: `packages/server/test/payment.transitions.test.ts`
- Modify: `packages/server/src/reports/reports.schemas.ts`
- Modify: `packages/server/src/reports/reports.service.ts:55-104`
- Modify: `packages/server/src/reports/reports.routes.ts:134-189`

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/payment.transitions.test.ts`:

```ts
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
    const { emp, finance } = await seedCast();
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
    const { emp, finance } = await seedCast();
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
    expect(row?.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
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
    const { emp, manager } = await seedCast();
    const report = await seedReport({ ownerId: emp.id, state: "SENT_FOR_PAYMENT" });
    const agent = await loginAs("m@x.it", "password123");
    const res = await agent.post(`/api/reports/${report.id}/mark-paid`).send({});
    expect(res.status).toBe(403);
  });
});

describe("GET /reports?scope=payments", () => {
  it("returns the payable states to finance across owners", async () => {
    const { emp, finance } = await seedCast();
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- payment.transitions`
Expected: FAIL — endpoints return 404 (routes not defined yet) / scope unhandled.

- [ ] **Step 3a: Add `markPaidSchema`**

In `packages/server/src/reports/reports.schemas.ts`, append:

```ts
// Body for the "mark-paid" transition. paidAt accepts an ISO date ("YYYY-MM-DD")
// or full ISO datetime; both must parse to a valid Date. paymentReference is
// optional free text (trimmed/null-ified in the route).
export const markPaidSchema = z.object({
  paidAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "data non valida" })
    .optional(),
  paymentReference: z.string().optional(),
});

export type MarkPaidInput = z.infer<typeof markPaidSchema>;
```

- [ ] **Step 3b: Extend `performTransition` with a payment argument**

In `packages/server/src/reports/reports.service.ts`, change the signature and the guarded update. Replace the function header (currently lines 55-60):

```ts
export async function performTransition(
  reportId: string,
  action: ReportAction,
  actor: Actor,
  comment?: string,
  payment?: { paidAt: Date; paymentReference: string | null },
) {
```

Then inside the `tx.expenseReport.update` `data` object (currently lines 88-92), add the mark-paid fields alongside the existing spreads:

```ts
        data: {
          state: def.to,
          ...(action === "submit" ? { submittedAt: new Date() } : {}),
          ...(isDecision ? { decidedAt: new Date(), decidedById: actor.id } : {}),
          ...(action === "mark-paid" && payment
            ? { paidAt: payment.paidAt, paymentReference: payment.paymentReference }
            : {}),
        },
```

- [ ] **Step 3c: Add the transition endpoints and thread `payment` through `runTransition`**

In `packages/server/src/reports/reports.routes.ts`:

Add the schema import (extend the existing import on line 5):

```ts
import {
  createReportSchema,
  updateReportSchema,
  reviseSchema,
  markPaidSchema,
} from "./reports.schemas.js";
```

Change the `runTransition` signature (line 136-141) to accept an optional payment object and pass it to the service, and surface `paidAt`/`paymentReference` in the response:

```ts
  async function runTransition(
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    action: ReportAction,
    comment?: string,
    payment?: { paidAt: Date; paymentReference: string | null },
  ): Promise<unknown> {
    const me = req.currentUser!;
    try {
      const updated = await performTransition(req.params.id, action, me, comment, payment);
      if (!updated) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      return reply.send({
        id: updated.id,
        ownerId: updated.ownerId,
        title: updated.title,
        state: updated.state,
        totalCents: updated.totalCents,
        paidAt: updated.paidAt,
        paymentReference: updated.paymentReference,
      });
    } catch (err) {
      if (err instanceof TransitionError) {
        const status = err.code === "NON_AUTORIZZATO" ? 403 : 409;
        return reply.code(status).send({ error: err.code });
      }
      throw err;
    }
  }
```

Add the two endpoints after the existing `revise` route (after line 188, before the closing brace of `reportRoutes`):

```ts
  app.post<{ Params: { id: string } }>(
    "/:id/send-payment",
    { preHandler: app.requireAuth },
    (req, reply) => runTransition(req, reply, "send-payment"),
  );

  app.post<{ Params: { id: string } }>(
    "/:id/mark-paid",
    { preHandler: app.requireAuth },
    (req, reply) => {
      const parsed = markPaidSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
      const paymentReference = parsed.data.paymentReference?.trim() || null;
      return runTransition(req, reply, "mark-paid", undefined, { paidAt, paymentReference });
    },
  );
```

- [ ] **Step 3d: Add the `?scope=payments` branch to the list endpoint**

In `packages/server/src/reports/reports.routes.ts`, the list handler (lines 21-42). Change `async (req) =>` to `async (req, reply) =>`, and add the payments branch before the approvals branch:

```ts
  app.get<{ Querystring: { scope?: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const me = req.currentUser!;
      if (req.query.scope === "payments") {
        if (!hasAtLeast(me.role, "FINANCE")) {
          return reply.code(403).send({ error: "NON_AUTORIZZATO" });
        }
        return prisma.expenseReport.findMany({
          where: { state: { in: ["APPROVED", "SENT_FOR_PAYMENT", "PAID"] } },
          select: reportSelect,
          orderBy: { submittedAt: "asc" },
        });
      }
      if (req.query.scope === "approvals") {
        return prisma.expenseReport.findMany({
          where: {
            state: "READY_FOR_APPROVAL",
            owner: hasAtLeast(me.role, "FINANCE") ? undefined : { managerId: me.id },
          },
          select: reportSelect,
          orderBy: { submittedAt: "asc" },
        });
      }
      return prisma.expenseReport.findMany({
        where: { ownerId: me.id },
        select: reportSelect,
        orderBy: { createdAt: "desc" },
      });
    },
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace packages/server -- payment.transitions`
Expected: PASS (all cases). Also run the existing reports suite to confirm no regression: `npm test --workspace packages/server -- reports`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/reports/ packages/server/test/payment.transitions.test.ts
git status --short
git commit -m "feat(server): expose send-payment & mark-paid + payments scope"
```

---

## Task 3: CSV export endpoints (TDD) + app wiring

**Files:**
- Create: `packages/server/src/payment/payment.routes.ts`
- Create: `packages/server/test/payment.export.test.ts`
- Modify: `packages/server/src/app.ts:7-12,33-45`

- [ ] **Step 1: Write the failing test**

Create `packages/server/test/payment.export.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace packages/server -- payment.export`
Expected: FAIL — export routes 404 (not registered).

- [ ] **Step 3a: Implement the export routes**

Create `packages/server/src/payment/payment.routes.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { hasAtLeast, REPORT_STATES, type ReportState } from "@gsa/shared";
import { buildReportCsv, buildItemCsv } from "./csv.js";

// Default export set when no ?state filter is given: everything payment-relevant.
const EXPORTABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];

function requireFinance(req: FastifyRequest, reply: FastifyReply): boolean {
  const me = req.currentUser!;
  if (!hasAtLeast(me.role, "FINANCE")) {
    reply.code(403).send({ error: "NON_AUTORIZZATO" });
    return false;
  }
  return true;
}

// Resolve the optional ?state filter. Returns null (after sending 400) if invalid.
function resolveStates(stateParam: string | undefined, reply: FastifyReply): ReportState[] | null {
  if (stateParam === undefined) return EXPORTABLE_STATES;
  if (!(REPORT_STATES as readonly string[]).includes(stateParam)) {
    reply.code(400).send({ error: "DATI_NON_VALIDI" });
    return null;
  }
  return [stateParam as ReportState];
}

function sendCsv(reply: FastifyReply, filePrefix: string, csv: string): FastifyReply {
  const today = new Date().toISOString().slice(0, 10);
  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="${filePrefix}-${today}.csv"`);
  return reply.send(csv);
}

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { state?: string } }>(
    "/export/reports.csv",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      if (!requireFinance(req, reply)) return;
      const states = resolveStates(req.query.state, reply);
      if (!states) return;
      const reports = await prisma.expenseReport.findMany({
        where: { state: { in: states } },
        select: {
          title: true,
          state: true,
          totalCents: true,
          submittedAt: true,
          decidedAt: true,
          paidAt: true,
          paymentReference: true,
          owner: { select: { fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      });
      const csv = buildReportCsv(
        reports.map((r) => ({
          ownerName: r.owner.fullName,
          title: r.title,
          state: r.state,
          totalCents: r.totalCents,
          submittedAt: r.submittedAt,
          decidedAt: r.decidedAt,
          paidAt: r.paidAt,
          paymentReference: r.paymentReference,
          itemCount: r._count.items,
        })),
      );
      return sendCsv(reply, "note-spese", csv);
    },
  );

  app.get<{ Querystring: { state?: string } }>(
    "/export/items.csv",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      if (!requireFinance(req, reply)) return;
      const states = resolveStates(req.query.state, reply);
      if (!states) return;
      const items = await prisma.expenseItem.findMany({
        where: { report: { state: { in: states } } },
        select: {
          date: true,
          category: true,
          description: true,
          amountCents: true,
          vatCents: true,
          enteredKm: true,
          ratePerKm: true,
          overageJustification: true,
          notes: true,
          vehicle: { select: { label: true } },
          report: {
            select: {
              title: true,
              state: true,
              owner: { select: { fullName: true } },
            },
          },
        },
        orderBy: [{ report: { submittedAt: "asc" } }, { date: "asc" }, { id: "asc" }],
      });
      const csv = buildItemCsv(
        items.map((i) => ({
          ownerName: i.report.owner.fullName,
          reportTitle: i.report.title,
          reportState: i.report.state,
          date: i.date,
          category: i.category,
          description: i.description,
          amountCents: i.amountCents,
          vatCents: i.vatCents,
          enteredKm: i.enteredKm,
          ratePerKm: i.ratePerKm == null ? null : i.ratePerKm.toString(),
          vehicleLabel: i.vehicle?.label ?? null,
          overageJustification: i.overageJustification,
          notes: i.notes,
        })),
      );
      return sendCsv(reply, "voci-spese", csv);
    },
  );
}
```

- [ ] **Step 3b: Register the routes**

In `packages/server/src/app.ts`, add the import after line 9:

```ts
import { paymentRoutes } from "./payment/payment.routes.js";
```

And register it inside the `/api` group, after `reportRoutes` (line 37):

```ts
      await api.register(reportRoutes, { prefix: "/reports" });
      await api.register(paymentRoutes, { prefix: "/reports" });
```

(The static paths `/reports/export/reports.csv` and `/reports/export/items.csv` do not collide with the parametric `/reports/:id` — different path depth.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace packages/server -- payment.export`
Expected: PASS. Then run the whole server suite: `npm test --workspace packages/server`
Expected: all files pass (existing + 3 new payment files).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/payment/payment.routes.ts packages/server/src/app.ts packages/server/test/payment.export.test.ts
git status --short
git commit -m "feat(server): report & item CSV export endpoints (finance only)"
```

---

## Task 4: Web API client helpers + i18n strings

**Files:**
- Modify: `packages/web/src/api/client.ts` (end of file)
- Modify: `packages/web/src/i18n.ts:9-53,66+`

- [ ] **Step 1: Add client helpers**

In `packages/web/src/api/client.ts`, append at the end:

```ts
export function sendPayment(id: string): Promise<void> {
  return api.post<void>(`/reports/${id}/send-payment`);
}

export interface MarkPaidInput {
  paidAt?: string;
  paymentReference?: string;
}

export function markPaid(id: string, input: MarkPaidInput): Promise<void> {
  return api.post<void>(`/reports/${id}/mark-paid`, input);
}

// Direct URL for an <a href download> so the session cookie is sent by the
// browser (no fetch/blob plumbing). `state` is optional; omit for the default
// payable set (APPROVED, SENT_FOR_PAYMENT, PAID).
export function exportCsvUrl(level: "reports" | "items", state?: ReportState): string {
  const query = state ? `?state=${encodeURIComponent(state)}` : "";
  return `/api/reports/export/${level}.csv${query}`;
}
```

- [ ] **Step 2: Add i18n strings**

In `packages/web/src/i18n.ts`:

Add to the `nav` block (after `settings: "Impostazioni",`):

```ts
      payments: "Pagamenti",
```

Add to the `reports` block (after `revise: "Richiedi revisione",`):

```ts
      sendPayment: "Invia al pagamento",
      markPaid: "Segna come pagata",
```

Add a new `payments` block (place it right after the closing `},` of the `reports` block):

```ts
    payments: {
      title: "Pagamenti",
      empty: "Nessuna nota spese da gestire.",
      owner: "Dipendente",
      reportTitle: "Nota spese",
      state: "Stato",
      total: "Totale",
      send: "Invia al pagamento",
      markPaid: "Segna come pagata",
      paidAt: "Data pagamento",
      reference: "Riferimento pagamento",
      confirmPaid: "Conferma pagamento",
      filter: "Filtra per stato",
      filterAll: "Tutti",
      exportReports: "Esporta CSV (note spese)",
      exportItems: "Esporta CSV (voci)",
      actionError: "Operazione non consentita.",
      loadError: "Impossibile caricare i pagamenti.",
    },
```

- [ ] **Step 3: Verify the web build still type-checks**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` + `vite build` succeed (the new exports/keys are unused so far but must compile).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/i18n.ts
git status --short
git commit -m "feat(web): payment API client helpers + Italian strings"
```

---

## Task 5: MarkPaidForm component + Pagamenti page + nav + route

**Files:**
- Create: `packages/web/src/components/MarkPaidForm.tsx`
- Create: `packages/web/src/pages/PagamentiPage.tsx`
- Modify: `packages/web/src/components/NavBar.tsx:24-27`
- Modify: `packages/web/src/App.tsx:12,34-41`

- [ ] **Step 1: Create the MarkPaidForm component**

Create `packages/web/src/components/MarkPaidForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { MarkPaidInput } from "../api/client.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Small reusable mileage-style form: a date (prefilled today) plus an optional
// payment reference. Used by both the Pagamenti queue and the report detail page.
export function MarkPaidForm({
  onSubmit,
}: {
  onSubmit: (input: MarkPaidInput) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    onSubmit({ paidAt, paymentReference: reference.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <label>
        {t("payments.paidAt")}{" "}
        <input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
        />
      </label>
      <input
        placeholder={t("payments.reference")}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <button type="submit">{t("payments.confirmPaid")}</button>
    </form>
  );
}
```

- [ ] **Step 2: Create the Pagamenti page**

Create `packages/web/src/pages/PagamentiPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  api,
  sendPayment,
  markPaid,
  exportCsvUrl,
  type ReportSummary,
  type ReportState,
  type MarkPaidInput,
} from "../api/client.js";
import { formatEuroFromCents } from "../format.js";
import { MarkPaidForm } from "../components/MarkPaidForm.js";

const PAYABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];

export function PagamentiPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [filter, setFilter] = useState<ReportState | "">("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setReports(await api.get<ReportSummary[]>("/reports?scope=payments"));
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("payments.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = filter ? reports.filter((r) => r.state === filter) : reports;

  async function onSend(id: string): Promise<void> {
    setError(null);
    try {
      await sendPayment(id);
      await refresh();
    } catch {
      setError(t("payments.actionError"));
    }
  }

  async function onPaid(id: string, input: MarkPaidInput): Promise<void> {
    setError(null);
    try {
      await markPaid(id, input);
      setPayingId(null);
      await refresh();
    } catch {
      setError(t("payments.actionError"));
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("payments.title")}</h1>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label>
          {t("payments.filter")}{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as ReportState | "")}>
            <option value="">{t("payments.filterAll")}</option>
            {PAYABLE_STATES.map((s) => (
              <option key={s} value={s}>
                {t(`states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <a href={exportCsvUrl("reports", filter || undefined)} download>
          {t("payments.exportReports")}
        </a>
        <a href={exportCsvUrl("items", filter || undefined)} download>
          {t("payments.exportItems")}
        </a>
      </div>

      {visible.length === 0 ? (
        <p>{t("payments.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("payments.reportTitle")}</th>
              <th style={{ textAlign: "right" }}>{t("payments.total")}</th>
              <th style={{ textAlign: "left" }}>{t("payments.state")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/note-spese/${r.id}`}>{r.title}</Link>
                </td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(r.totalCents)}</td>
                <td>{t(`states.${r.state}`)}</td>
                <td>
                  {r.state === "APPROVED" && (
                    <button onClick={() => void onSend(r.id)}>{t("payments.send")}</button>
                  )}
                  {r.state === "SENT_FOR_PAYMENT" &&
                    (payingId === r.id ? (
                      <MarkPaidForm onSubmit={(input) => void onPaid(r.id, input)} />
                    ) : (
                      <button onClick={() => setPayingId(r.id)}>{t("payments.markPaid")}</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `packages/web/src/components/NavBar.tsx`, after the approvals link (line 24):

```tsx
      {hasAtLeast(user.role, "MANAGER") && <Link to="/approvazioni">{t("nav.approvals")}</Link>}
      {hasAtLeast(user.role, "FINANCE") && <Link to="/pagamenti">{t("nav.payments")}</Link>}
```

- [ ] **Step 4: Add the route**

In `packages/web/src/App.tsx`, add the import (after line 12):

```tsx
import { PagamentiPage } from "./pages/PagamentiPage.js";
```

And the route (after the `/approvazioni` route, line 36):

```tsx
        <Route path="/pagamenti" element={<PagamentiPage />} />
```

- [ ] **Step 5: Verify the build**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/MarkPaidForm.tsx packages/web/src/pages/PagamentiPage.tsx packages/web/src/components/NavBar.tsx packages/web/src/App.tsx
git status --short
git commit -m "feat(web): Finance payments queue page + nav + route"
```

---

## Task 6: Payment actions on the report detail page

**Files:**
- Modify: `packages/web/src/pages/ReportDetailPage.tsx:1-13,55-64,134-148,321-332`

- [ ] **Step 1: Add imports and state**

In `packages/web/src/pages/ReportDetailPage.tsx`:

Extend the `@gsa/shared` import (line 4) to include `hasAtLeast`:

```tsx
import { actionsFor, hasAtLeast, MONEY_CATEGORIES, type MoneyCategory, type Category } from "@gsa/shared";
```

Extend the client import (lines 5-11) to add `markPaid` and `MarkPaidInput`:

```tsx
import {
  api,
  quoteMileage,
  markPaid,
  type ReportDetail,
  type Vehicle,
  type MileageQuote,
  type MarkPaidInput,
} from "../api/client.js";
```

Add the MarkPaidForm import (after line 13):

```tsx
import { MarkPaidForm } from "../components/MarkPaidForm.js";
```

Add a piece of state next to the other `useState` hooks (e.g. after line 37, the `quote` state):

```tsx
  const [showPayForm, setShowPayForm] = useState(false);
```

- [ ] **Step 2: Add the finance flag**

After `const canManage = ...` (line 63), add:

```tsx
  const isFinance = !!user && hasAtLeast(user.role, "FINANCE");
```

- [ ] **Step 3: Widen `act()` and add `payNow()`**

Change the `act` signature (line 134) to include `send-payment`:

```tsx
  async function act(
    action: "submit" | "approve" | "reject" | "revise" | "send-payment",
  ): Promise<void> {
```

(The body is unchanged: the `else` branch already does `POST /reports/:id/${action}`, which works for `send-payment`.)

Add `payNow` right after the `act` function (after line 148):

```tsx
  async function payNow(input: MarkPaidInput): Promise<void> {
    setError(null);
    try {
      await markPaid(report!.id, input);
      setShowPayForm(false);
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }
```

- [ ] **Step 4: Render the payment buttons**

In the action button row (the `<div>` at lines 321-332), add the Finance buttons after the `canManage` block, before the closing `</div>`:

```tsx
        {isFinance && available.includes("send-payment") && (
          <button onClick={() => void act("send-payment")}>{t("reports.sendPayment")}</button>
        )}
        {isFinance &&
          available.includes("mark-paid") &&
          (showPayForm ? (
            <MarkPaidForm onSubmit={(input) => void payNow(input)} />
          ) : (
            <button onClick={() => setShowPayForm(true)}>{t("reports.markPaid")}</button>
          ))}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build --workspace packages/web`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/ReportDetailPage.tsx
git status --short
git commit -m "feat(web): surface payment actions on the report detail page"
```

---

## Task 7: Add the FINANCE seed user

**Files:**
- Modify: `packages/server/src/scripts/seedDev.ts:38-52`

- [ ] **Step 1: Add the FINANCE user and update the log line**

In `packages/server/src/scripts/seedDev.ts`, after the `responsabile@azienda.it` block (line 43) and before the `dipendente@azienda.it` block, add:

```ts
  await upsertUser({
    email: "amministrazione@azienda.it",
    password: "password123",
    fullName: "Franca Finanza",
    role: "FINANCE",
  });
```

Update the console log (line 52) to:

```ts
  console.log(
    "Seeded dev users: admin@/responsabile@/amministrazione@/dipendente@azienda.it (password123)",
  );
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npm run seed:dev --workspace packages/server`
Expected: prints the updated "Seeded dev users" line, no error. (This also makes `amministrazione@azienda.it` available for the E2E in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/scripts/seedDev.ts
git status --short
git commit -m "chore(server): seed a FINANCE dev user (amministrazione@azienda.it)"
```

---

## Task 8: E2E happy path (Playwright)

**Files:**
- Create: `packages/web/e2e/payment.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `packages/web/e2e/payment.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Precondition: `npm run seed:dev --workspace packages/server` has created
// dipendente@ (employee → responsabile@ manager), responsabile@ (manager) and
// amministrazione@ (finance), all password "password123".

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

async function logout(page: import("@playwright/test").Page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/logout") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Esci" }).click(),
  ]);
}

test("finance sends an approved report to payment, marks it paid, and exports CSV", async ({ page }) => {
  const unique = `Pagamento E2E ${Date.now()}`;

  // Employee: create, add an item, submit.
  await login(page, "dipendente@azienda.it");
  await page.getByPlaceholder("Titolo della nota spese").fill(unique);
  await page.getByRole("button", { name: "Crea nota spese" }).click();
  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();
  await page.getByPlaceholder("Descrizione").fill("Treno A/R");
  await page.getByPlaceholder("Importo (€)").fill("45.00");
  await page.getByLabel("Data", { exact: true }).fill("2026-05-20");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();
  await expect(page.getByText("Treno A/R")).toBeVisible();
  await page.getByRole("button", { name: "Invia per approvazione" }).click();
  await expect(page.getByText("Da approvare")).toBeVisible();
  await logout(page);

  // Manager: approve.
  await login(page, "responsabile@azienda.it");
  await page.getByRole("link", { name: "Approvazioni" }).click();
  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await page.getByRole("button", { name: "Approva" }).click();
  await expect(page.getByText("Approvata")).toBeVisible();
  await logout(page);

  // Finance: send to payment, then mark paid with a reference.
  await login(page, "amministrazione@azienda.it");
  await page.getByRole("link", { name: "Pagamenti" }).click();
  await expect(page.getByRole("heading", { name: "Pagamenti" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(unique) });
  await row.getByRole("button", { name: "Invia al pagamento" }).click();
  await expect(row.getByText("Inviata al pagamento")).toBeVisible();
  await row.getByRole("button", { name: "Segna come pagata" }).click();
  await row.getByPlaceholder("Riferimento pagamento").fill("BON-E2E");
  await row.getByRole("button", { name: "Conferma pagamento" }).click();
  await expect(row.getByText("Pagata")).toBeVisible();

  // The CSV export link is present and points at the finance-only endpoint.
  const exportLink = page.getByRole("link", { name: "Esporta CSV (note spese)" });
  await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/export\/reports\.csv/);
});
```

- [ ] **Step 2: Run the full E2E suite**

Run: `npm run e2e --workspace packages/web`
Expected: all specs pass (existing reports/mileage/auth specs + the new payment spec). Playwright starts both dev servers (login rate limit already raised in `playwright.config.ts`).

If a stale dev server is already bound to port 3001/5173 with old code, stop it first so Playwright's `reuseExistingServer` doesn't reuse a pre-Slice-4 server.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/payment.spec.ts
git status --short
git commit -m "test(web): E2E payment + export happy path"
```

---

## Task 9: Verify everything + README + finish branch

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full server + web verification**

Run:
- `npm run build --workspace packages/shared` (no shared changes, but keep dist current)
- `npm test --workspace packages/server`
- `npm test --workspace packages/web`
- `npm run build --workspace packages/web`

Expected: all green; web build clean.

- [ ] **Step 2: Update the README**

In `README.md`:

Remove the obsolete bullet in the Slice 2 "Non ancora implementato" subsection (lines 63-64) that says payment transitions are "non ancora esposte" and that CSV export is "prevista per la Slice 4". If that leaves the subsection empty, delete the `### Non ancora implementato` heading too.

Add a new section after the Slice 3b section:

```markdown
## Funzionalità (Slice 4 — pagamento ed esportazione)

- **Pagamenti (Amministrazione/Amministratore):** la coda **Pagamenti** elenca le
  note spese approvate, inviate al pagamento e pagate. Da qui si **invia al
  pagamento** una nota approvata e si **segna come pagata** indicando la data
  (preimpostata a oggi, modificabile) e un **riferimento di pagamento** facoltativo.
  Le stesse azioni sono disponibili anche nel dettaglio della nota spese.
- **Esportazione CSV per la contabilità:** due esportazioni — una **per nota spese**
  (una riga per nota, con totale e dati di pagamento) e una **per voce** (una riga
  per voce di spesa). Formato compatibile con Excel italiano: separatore `;`,
  decimali con la virgola, intestazioni in italiano, codifica UTF-8 con BOM.
  Filtrabile per stato (`?state=...`).

### Note per lo sviluppo (Slice 4)

- Utente di prova aggiunto: `amministrazione@azienda.it` (Amministrazione/FINANCE,
  password `password123`). Rieseguire `npm run seed:dev --workspace packages/server`
  per crearlo.
- Endpoint: `POST /api/reports/:id/send-payment`, `POST /api/reports/:id/mark-paid`,
  `GET /api/reports/export/reports.csv`, `GET /api/reports/export/items.csv`
  (solo FINANCE/ADMIN), e `GET /api/reports?scope=payments`.
- Builder CSV puro in `packages/server/src/payment/csv.ts`.
- Non ancora implementato: l'**annullamento/inversione** di una transizione
  (es. riportare indietro una nota approvata o annullare un pagamento), i lotti di
  pagamento e l'integrazione bancaria.
```

- [ ] **Step 3: Commit the README**

```bash
git add README.md
git status --short
git commit -m "docs: README Slice 4 payment & export"
```

- [ ] **Step 4: Finish the branch**

Use the **superpowers:finishing-a-development-branch** skill: verify tests pass, then present the merge/PR/keep/discard options and execute the chosen one.

---

## Self-Review (filled in by the plan author)

**1. Spec coverage:**
- §1 scope (send-payment, mark-paid, payment metadata, queue UI, two CSV exports, override deferred) → Tasks 2, 5, 6, 3, 9. ✓
- §2 no shared changes, CSV server-side → Task 1 (server `src/payment/csv.ts`). ✓
- §3 transitions + `markPaidSchema` + service payment arg + error mapping → Task 2. ✓
- §4.1 pure core (`toCsv`, `formatEuroCents`, `formatItDate`, builders, BOM, `;`, CRLF) → Task 1. ✓
- §4.2 endpoints, finance-only, `state` validation + default set, headers → Task 3. ✓
- §4.3 columns/headers + Italian label maps → Tasks 1 & 3 (tested in both). ✓
- §5 web client + queue page + detail buttons + nav + i18n → Tasks 4, 5, 6. ✓
- §6 `?scope=payments` finance-only → Task 2. ✓
- §7 FINANCE seed user + E2E → Tasks 7, 8. ✓
- §8 testing (pure unit + API integration + E2E) → Tasks 1, 2, 3, 8. ✓
- §9 file list → matches Tasks 1-9. ✓
- §10 money invariants (cents in, format only at boundary) → Task 1 `formatEuroCents`. ✓

**2. Placeholder scan:** none — every code step has complete code and exact commands.

**3. Type consistency:** `ReportExportRow`/`ItemExportRow` field names used in Task 1 match the Task 3 mappers; `MarkPaidInput` defined in Task 4 and consumed in Tasks 5 & 6; `markPaid`/`sendPayment`/`exportCsvUrl` signatures consistent across client, page, and detail; `performTransition` payment arg shape (`{ paidAt: Date; paymentReference: string | null }`) consistent between service and route.
