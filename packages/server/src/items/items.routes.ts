import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { isEditableState } from "@gsa/shared";
import { recomputeTotal } from "../reports/reports.service.js";
import { createItemSchema, updateItemSchema } from "./items.schemas.js";

const itemSelect = {
  id: true,
  category: true,
  date: true,
  description: true,
  amountCents: true,
  vatCents: true,
  receiptRef: true,
  notes: true,
} satisfies Prisma.ExpenseItemSelect;

// Loads the parent report and enforces: it exists, the caller owns it, and it
// is in an employee-editable state. Returns the report id, or null after it has
// already sent the appropriate error response.
async function requireEditableOwnReport(
  req: FastifyRequest,
  reply: FastifyReply,
  reportId: string,
): Promise<string | null> {
  const me = req.currentUser!;
  const report = await prisma.expenseReport.findUnique({ where: { id: reportId } });
  if (!report) {
    await reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
    return null;
  }
  if (report.ownerId !== me.id) {
    await reply.code(403).send({ error: "NON_AUTORIZZATO" });
    return null;
  }
  if (!isEditableState(report.state)) {
    await reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
    return null;
  }
  return report.id;
}

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/reports/:reportId/items".
  app.post<{ Params: { reportId: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const item = await prisma.expenseItem.create({
        data: { reportId, ...parsed.data },
        select: itemSelect,
      });
      await recomputeTotal(reportId);
      return reply.code(201).send(item);
    },
  );

  app.patch<{ Params: { reportId: string; itemId: string } }>(
    "/:itemId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const existing = await prisma.expenseItem.findFirst({
        where: { id: req.params.itemId, reportId },
      });
      if (!existing) return reply.code(404).send({ error: "VOCE_NON_TROVATA" });

      const item = await prisma.expenseItem.update({
        where: { id: req.params.itemId },
        data: parsed.data,
        select: itemSelect,
      });
      await recomputeTotal(reportId);
      return item;
    },
  );

  app.delete<{ Params: { reportId: string; itemId: string } }>(
    "/:itemId",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const reportId = await requireEditableOwnReport(req, reply, req.params.reportId);
      if (!reportId) return;

      const existing = await prisma.expenseItem.findFirst({
        where: { id: req.params.itemId, reportId },
      });
      if (!existing) return reply.code(404).send({ error: "VOCE_NON_TROVATA" });

      await prisma.expenseItem.delete({ where: { id: req.params.itemId } });
      await recomputeTotal(reportId);
      return reply.code(204).send();
    },
  );
}
