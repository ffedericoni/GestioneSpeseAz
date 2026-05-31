import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  MILEAGE_TOLERANCE_KEY,
  parseTolerancePercent,
  computeBaselineKm,
  toleranceRange,
} from "@gsa/shared";
import { ManualDistanceProvider } from "../core/distanceProvider.js";

const provider = new ManualDistanceProvider();

export const quoteSchema = z.object({
  vehicleId: z.string().min(1),
  originAddress: z.string().min(1),
  destinationAddress: z.string().min(1),
  roundTrip: z.boolean(),
  manualKm: z.number().int().positive(),
});

// Loads the current tolerance percent (default when unset).
async function currentTolerancePercent(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
  return parseTolerancePercent(setting?.value);
}

export async function mileageRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/items".
  app.post("/mileage/quote", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: parsed.data.vehicleId, userId: me.id },
      include: { aciRate: { select: { costPerKm: true } } },
    });
    if (!vehicle) return reply.code(404).send({ error: "VEICOLO_NON_TROVATO" });

    const tolerancePercent = await currentTolerancePercent();
    const oneWayKm = await provider.getDistanceKm({
      origin: parsed.data.originAddress,
      destination: parsed.data.destinationAddress,
      manualKm: parsed.data.manualKm,
    });
    const baselineKm = computeBaselineKm(oneWayKm, parsed.data.roundTrip);
    const { upperBoundKm } = toleranceRange(baselineKm, tolerancePercent);

    return {
      baselineKm,
      upperBoundKm,
      tolerancePercent,
      ratePerKm: vehicle.aciRate.costPerKm.toString(),
    };
  });
}
