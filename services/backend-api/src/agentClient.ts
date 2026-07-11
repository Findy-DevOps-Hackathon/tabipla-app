import { fetchWithTimeout } from "./fetchWithTimeout.js";

/** agent 側 internalAuth.ts と同じヘッダー名。 */
export const AGENT_INTERNAL_TOKEN_HEADER = "x-tabipla-agent-token";

export function getAgentInternalSecret(): string {
  const secret = process.env.AGENT_INTERNAL_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AGENT_INTERNAL_SECRET is required in production.");
  }
  return "tabipla-dev-agent-internal-secret";
}

export function getAgentApiUrl(): string {
  return process.env.AGENT_API_URL ?? "http://localhost:8080";
}

export function agentRequestHeaders(extra?: RequestInit["headers"]): Headers {
  const headers = new Headers(extra);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set(AGENT_INTERNAL_TOKEN_HEADER, getAgentInternalSecret());
  return headers;
}

/** backend-api から agent へ JSON リクエストを送る。 */
export async function fetchAgent(
  path: string,
  init: RequestInit = {},
  timeoutMs = 240_000,
): Promise<Response> {
  const url = `${getAgentApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetchWithTimeout(
    url,
    {
      ...init,
      headers: agentRequestHeaders(init.headers),
    },
    timeoutMs,
  );
}
