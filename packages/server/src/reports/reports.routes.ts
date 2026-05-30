import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hasAtLeast, isEditableState } from "@gsa/shared";
import { createReportSchema, updateReportSchema } from "./reports.schemas.js";

const reportSelect = {
  id: true,
  ownerId: true,
  title: true,
  state: true,
  totalCents: true,
  submittedAt: true,
  decidedAt: true,
  createdAt: true,
} satisfies Prisma.ExpenseReportSelect;

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // List. ?scope=approvals -> reports awaiting the caller as manager.
  app.get<{ Querystring: { scope?: string } }>(
    "/",
    { preHandler: app.requireAuth },
    async (req) => {
      const me = req.currentUser!;
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

  app.post("/", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;
    const report = await prisma.expenseReport.create({
      data: { ownerId: me.id, title: parsed.data.title },
      select: reportSelect,
    });
    return reply.code(201).send(report);
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({
        where: { id: req.params.id },
        select: {
          ...reportSelect,
          owner: { select: { id: true, fullName: true, managerId: true } },
          items: {
            select: {
              id: true,
              category: true,
              date: true,
              description: true,
              amountCents: true,
              vatCents: true,
              notes: true,
            },
            orderBy: { date: "asc" },
          },
          events: {
            select: { fromState: true, toState: true, comment: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });

      const canView =
        report.ownerId === me.id ||
        report.owner.managerId === me.id ||
        hasAtLeast(me.role, "FINANCE");
      if (!canView) return reply.code(403).send({ error: "NON_AUTORIZZATO" });

      return report;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateReportSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      if (report.ownerId !== me.id) return reply.code(403).send({ error: "NON_AUTORIZZATO" });
      if (!isEditableState(report.state)) {
        return reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
      }
      const updated = await prisma.expenseReport.update({
        where: { id: req.params.id },
        data: { title: parsed.data.title },
        select: reportSelect,
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const me = req.currentUser!;
      const report = await prisma.expenseReport.findUnique({ where: { id: req.params.id } });
      if (!report) return reply.code(404).send({ error: "NOTA_SPESE_NON_TROVATA" });
      if (report.ownerId !== me.id) return reply.code(403).send({ error: "NON_AUTORIZZATO" });
      // Only an untouched draft may be deleted.
      if (report.state !== "CREATED") {
        return reply.code(409).send({ error: "NOTA_SPESE_NON_MODIFICABILE" });
      }
      await prisma.expenseReport.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    },
  );
}
