import type { Hono } from "hono";
import { AgentHandlerError } from "../handlers.js";
import { tabiplaAgentPlatformApp } from "./app.js";

type QueryRequest = {
  class_method?: string;
  input?: Record<string, unknown>;
};

function resolveMethod(
  methodName: string | undefined,
): ((input: Record<string, unknown>) => unknown) | null {
  if (!methodName) return null;
  const app = tabiplaAgentPlatformApp as unknown as Record<
    string,
    (input: Record<string, unknown>) => unknown
  >;
  const method = app[methodName];
  if (typeof method !== "function") return null;
  return (input) => method.call(tabiplaAgentPlatformApp, input);
}

async function invokeMethod(
  methodName: string | undefined,
  input: Record<string, unknown> | undefined,
) {
  const method = resolveMethod(methodName);
  if (!method) {
    throw new AgentHandlerError(`Unknown class_method: ${methodName ?? "(empty)"}`, 400, {
      error: `Unknown class_method: ${methodName ?? "(empty)"}`,
    });
  }
  try {
    const output = await method(input ?? {});
    return { output };
  } catch (e) {
    if (e instanceof AgentHandlerError) {
      throw e;
    }
    throw new AgentHandlerError(e instanceof Error ? e.message : String(e), 500, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Agent Platform Runtime が要求する Reasoning Engine API を Hono に登録する。 */
export function registerAgentPlatformRoutes(app: Hono): void {
  app.post("/api/reasoning_engine", async (c) => {
    const body = await c.req.json<QueryRequest>();
    try {
      const result = await invokeMethod(body.class_method, body.input);
      return c.json(result);
    } catch (e) {
      if (e instanceof AgentHandlerError) {
        return c.json(e.body ?? { error: e.message }, e.statusCode as 400 | 404 | 429 | 500);
      }
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.post("/api/stream_reasoning_engine", async (c) => {
    const body = await c.req.json<QueryRequest>();
    try {
      const result = await invokeMethod(body.class_method, body.input);
      return c.json(result);
    } catch (e) {
      if (e instanceof AgentHandlerError) {
        return c.json(e.body ?? { error: e.message }, e.statusCode as 400 | 404 | 429 | 500);
      }
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
