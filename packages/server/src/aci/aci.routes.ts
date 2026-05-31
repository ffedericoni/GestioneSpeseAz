import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { importAciCsv } from "./aci.service.js";

export async function aciRoutes(app: FastifyInstance): Promise<void> {
  // Mounted with prefix "/api/aci".

  // Admin uploads a normalized CSV (multipart, field name "file").
  app.post("/import", { preHandler: app.requireRole("ADMIN") }, async (req, reply) => {
    // req.file() throws if the request is not multipart/form-data; treat any
    // missing/invalid upload as a plain bad request rather than a 500/406.
    let file: Awaited<ReturnType<typeof req.file>>;
    try {
      file = await req.file();
    } catch {
      return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    }
    if (!file) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const buf = await file.toBuffer();
    const result = await importAciCsv(buf.toString("utf-8"), file.filename, req.currentUser!.id);
    if (!result.ok) {
      return reply.code(400).send({ error: "DATI_NON_VALIDI", righe: result.errors });
    }
    return reply.code(201).send(result.batch);
  });

  // Search rates for vehicle linking. Authenticated; limited result set.
  app.get<{ Querystring: { search?: string; year?: string } }>(
    "/rates",
    { preHandler: app.requireAuth },
    async (req) => {
      const { search, year } = req.query;
      const where: Prisma.AciRateWhereInput = {};
      if (year) where.year = Number(year);
      if (search) {
        where.OR = [
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { fuel: { contains: search, mode: "insensitive" } },
        ];
      }
      const rates = await prisma.aciRate.findMany({
        where,
        orderBy: [{ year: "desc" }, { make: "asc" }, { model: "asc" }],
        take: 50,
      });
      return rates.map((r) => ({
        id: r.id,
        year: r.year,
        make: r.make,
        model: r.model,
        fuel: r.fuel,
        variant: r.variant,
        costPerKm: r.costPerKm.toString(),
      }));
    },
  );
}
