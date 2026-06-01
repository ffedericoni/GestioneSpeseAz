import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";

const publicSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  managerId: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = { preHandler: app.requireRole("ADMIN") };

  app.get("/", adminOnly, async () => {
    return prisma.user.findMany({
      select: publicSelect,
      orderBy: { fullName: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/:id", adminOnly, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: publicSelect,
    });
    if (!user) return reply.code(404).send({ error: "UTENTE_NON_TROVATO" });
    return user;
  });

  app.post("/", adminOnly, async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return reply.code(409).send({ error: "EMAIL_GIA_REGISTRATA" });

    if (data.role !== "ADMIN" && !data.managerId) {
      return reply.code(400).send({ error: "APPROVATORE_OBBLIGATORIO" });
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        fullName: data.fullName,
        role: data.role,
        managerId: data.managerId ?? null,
      },
      select: publicSelect,
    });
    return reply.code(201).send(user);
  });

  app.patch<{ Params: { id: string } }>("/:id", adminOnly, async (req, reply) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    const data = parsed.data;

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "UTENTE_NON_TROVATO" });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.managerId !== undefined ? { managerId: data.managerId } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.password !== undefined
          ? { passwordHash: await hashPassword(data.password) }
          : {}),
      },
      select: publicSelect,
    });
    return user;
  });
}
