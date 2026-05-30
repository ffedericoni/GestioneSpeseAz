import Fastify, { type FastifyInstance } from "fastify";
import { sessionPlugin } from "./plugins/session.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/users.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(sessionPlugin);
  await app.register(authRoutes);
  await app.register(userRoutes, { prefix: "/users" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
