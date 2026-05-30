import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword } from "./password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "DATI_NON_VALIDI" });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "CREDENZIALI_NON_VALIDE" });
    }

    req.session.set("user", { id: user.id, role: user.role });
    return reply.send({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  });

  app.post("/logout", async (req, reply) => {
    req.session.delete();
    return reply.send({ ok: true });
  });

  app.get("/me", { preHandler: app.requireAuth }, async (req, reply) => {
    const sessionUser = req.currentUser!;
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.active) {
      req.session.delete();
      return reply.code(401).send({ error: "NON_AUTENTICATO" });
    }
    return reply.send({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  });
}
