import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword, DUMMY_HASH } from "./password.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface AuthRoutesOptions {
  loginRateMax: number;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: AuthRoutesOptions,
): Promise<void> {
  app.post(
    "/login",
    {
      config: {
        rateLimit: { max: opts.loginRateMax, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "DATI_NON_VALIDI" });
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      // Always run a bcrypt comparison (against a dummy hash when the user is
      // unknown) so the response time does not reveal whether the email exists.
      const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

      if (!user || !user.active || !passwordOk) {
        return reply.code(401).send({ error: "CREDENZIALI_NON_VALIDE" });
      }

      req.session.set("user", { id: user.id, role: user.role });
      return reply.send({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      });
    },
  );

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
