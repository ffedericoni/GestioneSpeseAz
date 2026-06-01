import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { REPORT_STATES, type ReportState } from "@gsa/shared";
import { buildReportCsv, buildItemCsv } from "./csv.js";

// Default export set when no ?state filter is given: everything payment-relevant.
const EXPORTABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];

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
    { preHandler: app.requireRole("FINANCE") },
    async (req, reply) => {
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
    { preHandler: app.requireRole("FINANCE") },
    async (req, reply) => {
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
