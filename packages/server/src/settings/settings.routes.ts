import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { MILEAGE_TOLERANCE_KEY, parseTolerancePercent } from "@gsa/shared";

const toleranceSchema = z.object({
  tolerancePercent: z.number().int().min(0).max(100),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/settings".

  app.get("/mileage-tolerance", { preHandler: app.requireAuth }, async () => {
    const setting = await prisma.setting.findUnique({ where: { key: MILEAGE_TOLERANCE_KEY } });
    return { tolerancePercent: parseTolerancePercent(setting?.value) };
  });

  app.put("/mileage-tolerance", { preHandler: app.requireRole("ADMIN") }, async (req, reply) => {
    const parsed = toleranceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const value = String(parsed.data.tolerancePercent);
    await prisma.setting.upsert({
      where: { key: MILEAGE_TOLERANCE_KEY },
      update: { value },
      create: { key: MILEAGE_TOLERANCE_KEY, value },
    });
    return { tolerancePercent: parsed.data.tolerancePercent };
  });
}
