import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySecureSession from "@fastify/secure-session";
import fp from "fastify-plugin";
import type { Role } from "../core/roles.js";
import { hasAtLeast } from "../core/roles.js";

export interface SessionUser {
  id: string;
  role: Role;
}

declare module "@fastify/secure-session" {
  interface SessionData {
    user: SessionUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      minimum: Role,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser?: SessionUser;
  }
}

async function sessionPluginImpl(app: FastifyInstance): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }

  await app.register(fastifyCookie);
  await app.register(fastifySecureSession, {
    secret,
    salt: "gsa-session-salt",
    cookieName: "gsa_session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });

  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = req.session.get("user");
      if (!user) {
        await reply.code(401).send({ error: "NON_AUTENTICATO" });
        return;
      }
      req.currentUser = user;
    },
  );

  app.decorate("requireRole", (minimum: Role) => {
    return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = req.session.get("user");
      if (!user) {
        await reply.code(401).send({ error: "NON_AUTENTICATO" });
        return;
      }
      if (!hasAtLeast(user.role, minimum)) {
        await reply.code(403).send({ error: "NON_AUTORIZZATO" });
        return;
      }
      req.currentUser = user;
    };
  });
}

export const sessionPlugin = fp(sessionPluginImpl);
