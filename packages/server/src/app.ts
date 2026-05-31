import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { sessionPlugin } from "./plugins/session.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/users.routes.js";
import { reportRoutes } from "./reports/reports.routes.js";
import { itemRoutes } from "./items/items.routes.js";
import { aciRoutes } from "./aci/aci.routes.js";
import { vehicleRoutes } from "./vehicles/vehicles.routes.js";

export interface BuildAppOptions {
  // Max login attempts per IP per minute. Low in production; tests override high.
  loginRateMax?: number;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const loginRateMax = opts.loginRateMax ?? Number(process.env.LOGIN_RATE_MAX ?? 5);

  const app = Fastify({ logger: false });

  // Registered globally:false so it only applies to routes that opt in via
  // config.rateLimit (the login route).
  await app.register(rateLimit, { global: false });

  // Enables req.file() for the ACI CSV import endpoint.
  await app.register(multipart);

  await app.register(sessionPlugin);

  await app.register(
    async (api) => {
      await api.register(authRoutes, { loginRateMax });
      await api.register(userRoutes, { prefix: "/users" });
      await api.register(reportRoutes, { prefix: "/reports" });
      await api.register(itemRoutes, { prefix: "/reports/:reportId/items" });
      await api.register(aciRoutes, { prefix: "/aci" });
      await api.register(vehicleRoutes, { prefix: "/vehicles" });
    },
    { prefix: "/api" },
  );

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
