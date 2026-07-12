import { serve } from "@hono/node-server";
import { Hono, type MiddlewareHandler } from "hono";
import { registerAgentPlatformRoutes } from "./agentPlatform/routes.js";
import {
  AgentHandlerError,
  handleAskSpot,
  handleCollectSpots,
  handleDescribeSpot,
  handleGenerateSpotImage,
  handlePersonalizedPlan,
} from "./handlers.js";
import { AGENT_INTERNAL_TOKEN_HEADER, verifyAgentInternalToken } from "./internalAuth.js";

const app = new Hono();

/** Firebase Hosting /agent/** プロキシ: プレフィックスを除去して既存ルートに合わせる。 */
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/agent/")) return next();
  const url = new URL(c.req.url);
  url.pathname = path.slice("/agent".length) || "/";
  return app.fetch(new Request(url, c.req.raw));
});

const requireInternalAuth: MiddlewareHandler = async (c, next) => {
  const token = c.req.header(AGENT_INTERNAL_TOKEN_HEADER);
  if (!verifyAgentInternalToken(token)) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  return next();
};

app.use("/v1/*", requireInternalAuth);
registerAgentPlatformRoutes(app);

app.get("/", (c) =>
  c.json({
    service: "tabipla-agent",
    ok: true,
    runtime: "gemini-enterprise-agent-platform",
  }),
);
app.get("/healthz", (c) => c.json({ ok: true }));

function toJsonResponse(c: { json: (body: unknown, status?: number) => Response }, e: unknown) {
  if (e instanceof AgentHandlerError) {
    return c.json(e.body ?? { error: e.message }, e.statusCode as 400 | 404 | 429 | 500);
  }
  return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
}

app.post("/v1/personalized/plan", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(await handlePersonalizedPlan(body));
  } catch (e) {
    return toJsonResponse(c, e);
  }
});

app.post("/v1/spots/:id/ask", async (c) => {
  const spotId = c.req.param("id");
  const body = await c.req.json();
  return c.json(await handleAskSpot({ ...body, spotId }));
});

app.post("/v1/collect-spots", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(await handleCollectSpots(body));
  } catch (e) {
    return toJsonResponse(c, e);
  }
});

app.post("/v1/describe-spot", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(await handleDescribeSpot(body));
  } catch (e) {
    return toJsonResponse(c, e);
  }
});

app.post("/v1/generate-spot-image", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(await handleGenerateSpotImage(body));
  } catch (e) {
    return toJsonResponse(c, e);
  }
});

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `agent listening on http://localhost:${info.port} (Gemini Enterprise Agent Platform)`,
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[agent] ポート ${port} は既に使用中です。` +
        " 先に動いている agent を停止するか、`PORT=8081 pnpm -C services/agent dev` のように別ポートを指定してください。",
    );
  } else {
    console.error("[agent] server error:", err);
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
