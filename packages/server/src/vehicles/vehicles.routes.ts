import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { createVehicleSchema, updateVehicleSchema } from "./vehicles.schemas.js";

const vehicleSelect = {
  id: true,
  label: true,
  plate: true,
  active: true,
  aciRateId: true,
  aciRate: {
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      fuel: true,
      variant: true,
      costPerKm: true,
    },
  },
} satisfies Prisma.VehicleSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof vehicleSelect }>;

// Decimal -> string for JSON.
function serialize(v: VehicleRow) {
  return { ...v, aciRate: { ...v.aciRate, costPerKm: v.aciRate.costPerKm.toString() } };
}

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/vehicles". All routes are self-scoped.

  app.get("/", { preHandler: app.requireAuth }, async (req) => {
    const me = req.currentUser!;
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: me.id },
      select: vehicleSelect,
      orderBy: { createdAt: "desc" },
    });
    return vehicles.map(serialize);
  });

  app.post("/", { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = createVehicleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const me = req.currentUser!;

    const rate = await prisma.aciRate.findUnique({ where: { id: parsed.data.aciRateId } });
    if (!rate) return reply.code(400).send({ error: "TARIFFA_ACI_NON_TROVATA" });

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: me.id,
        label: parsed.data.label,
        aciRateId: parsed.data.aciRateId,
        plate: parsed.data.plate ?? null,
      },
      select: vehicleSelect,
    });
    return reply.code(201).send(serialize(vehicle));
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const parsed = updateVehicleSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      const me = req.currentUser!;

      const existing = await prisma.vehicle.findFirst({
        where: { id: req.params.id, userId: me.id },
      });
      if (!existing) return reply.code(404).send({ error: "VEICOLO_NON_TROVATO" });

      const data = parsed.data;
      const vehicle = await prisma.vehicle.update({
        where: { id: req.params.id },
        data: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.plate !== undefined ? { plate: data.plate } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
        select: vehicleSelect,
      });
      return serialize(vehicle);
    },
  );
}
