import type { FastifyInstance } from "fastify";

const DEFAULT_ORIGINS = [
  "https://tabipla-admin-web.web.app",
  "https://tabipla-admin-web.firebaseapp.com",
  "http://localhost:5174",
];

function getAllowedOrigins(): Set<string> {
  const fromEnv = process.env.CORS_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(fromEnv?.length ? fromEnv : DEFAULT_ORIGINS);
}

/** 管理画面（Firebase Hosting）からのクロスオリジン API 呼び出しを許可する。 */
export function registerCors(app: FastifyInstance): void {
  const allowed = getAllowedOrigins();

  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      reply.header("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
}
