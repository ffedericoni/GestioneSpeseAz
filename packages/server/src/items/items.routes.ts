import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  isEditableState,
  MILEAGE_TOLERANCE_KEY,
  parseTolerancePercent,
  computeBaselineKm,
  evaluateEnteredKm,
  mileageAmountCents,
} from "@gsa/shared";
import { recomputeTotal } from "../reports/reports.service.js";
import { createItemSchema, updateItemSchema } from "./items.schemas.js";
import { ManualDistanceProvider } from "../core/distanceProvider.js";

const distanceProvider = new ManualDistanceProvider();

const itemSelect = {
  id: true,
  category: true,
  date: true,
  description: true,
  amountCents: true,
  vatCents: true,
  receiptRef: true,
  notes: true,
  vehicleId: true,
  originAddress: true,
  destinationAddress: true,
  roundTrip: true,
  baselineKm: true,
  tolerancePercent: true,
  enteredKm: true,
  ratePerKm: true,
  overageJustification: true,
  routeProvider: true,
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

      const data = parsed.data;

      if (data.category === "MILEAGE") {
        const me = req.currentUser!;
        // Vehicle must exist AND belong to the caller; an unknown/foreign vehicle
        // makes the body invalid for this user (400, not a bare 404).
        const vehicle = await prisma.vehicle.findFirst({
          where: { id: data.vehicleId, userId: me.id },
          include: { aciRate: { select: { costPerKm: true } } },
        });
        if (!vehicle) return reply.code(400).send({ error: "DATI_NON_VALIDI" });

        const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
        const tolerancePercent = parseTolerancePercent(setting?.value);

        const oneWayKm = await distanceProvider.getDistanceKm({
          origin: data.originAddress,
          destination: data.destinationAddress,
          manualKm: data.manualKm,
        });
        const baselineKm = computeBaselineKm(oneWayKm, data.roundTrip);

        const evaluation = evaluateEnteredKm({
          enteredKm: data.enteredKm,
          baselineKm,
          tolerancePercent,
          justification: data.overageJustification,
        });
        if (!evaluation.ok) return reply.code(400).send({ error: "DATI_NON_VALIDI" });

        const ratePerKm = vehicle.aciRate.costPerKm.toString();
        const amountCents = mileageAmountCents(data.enteredKm, ratePerKm);

        const item = await prisma.expenseItem.create({
          data: {
            reportId,
            category: "MILEAGE",
            date: data.date,
            description: data.description,
            amountCents,
            notes: data.notes ?? null,
            vehicleId: vehicle.id,
            originAddress: data.originAddress,
            destinationAddress: data.destinationAddress,
            roundTrip: data.roundTrip,
            baselineKm,
            tolerancePercent,
            enteredKm: data.enteredKm,
            ratePerKm,
            overageJustification: evaluation.overUpperBound ? (data.overageJustification ?? null) : null,
            routeProvider: "MANUAL",
          },
          select: itemSelect,
        });
        await recomputeTotal(reportId);
        return reply.code(201).send(item);
      }

      // Money categories: unchanged behaviour.
      const item = await prisma.expenseItem.create({
        data: { reportId, ...data },
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
