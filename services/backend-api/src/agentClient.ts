import { fetchWithTimeout } from "./fetchWithTimeout.js";

/** agent 側 internalAuth.ts と同じヘッダー名。 */
export const AGENT_INTERNAL_TOKEN_HEADER = "x-tabipla-agent-token";

const AGENT_PLATFORM_METHODS = {
  "/v1/personalized/plan": "personalizedPlan",
  "/v1/collect-spots": "collectSpots",
  "/v1/describe-spot": "describeSpot",
  "/v1/generate-spot-image": "generateSpotImage",
  "/v1/spots/ask": "askSpot",
} as const;

type AgentPlatformMethod =
  | (typeof AGENT_PLATFORM_METHODS)[keyof typeof AGENT_PLATFORM_METHODS]
  | "askSpot";

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

export function getAgentPlatformResource(): string | null {
  const resource = process.env.AGENT_PLATFORM_RESOURCE?.trim();
  return resource || null;
}

export function getAgentPlatformLocation(): string {
  return process.env.AGENT_PLATFORM_LOCATION?.trim() || "asia-northeast1";
}

export function usesAgentPlatform(): boolean {
  return getAgentPlatformResource() !== null;
}

export function agentRequestHeaders(extra?: RequestInit["headers"]): Headers {
  const headers = new Headers(extra);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set(AGENT_INTERNAL_TOKEN_HEADER, getAgentInternalSecret());
  return headers;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  if (!token) {
    throw new Error("[backend-api] Google Cloud アクセストークンの取得に失敗しました。");
  }
  cachedAccessToken = {
    token,
    expiresAt: Date.now() + 3_300_000,
  };
  return token;
}

function resolveAgentPlatformMethod(path: string): AgentPlatformMethod | null {
  if (path in AGENT_PLATFORM_METHODS) {
    return AGENT_PLATFORM_METHODS[path as keyof typeof AGENT_PLATFORM_METHODS];
  }
  const askMatch = path.match(/^\/v1\/spots\/([^/]+)\/ask$/);
  if (askMatch) return "askSpot";
  return null;
}

function buildAgentPlatformInput(path: string, body: unknown): Record<string, unknown> {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? ({ ...(body as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const askMatch = path.match(/^\/v1\/spots\/([^/]+)\/ask$/);
  if (askMatch) {
    input.spotId = askMatch[1];
  }
  return input;
}

async function fetchAgentPlatform(
  path: string,
  init: RequestInit = {},
  timeoutMs = 240_000,
): Promise<Response> {
  const resource = getAgentPlatformResource();
  if (!resource) {
    throw new Error("AGENT_PLATFORM_RESOURCE is not configured.");
  }
  const classMethod = resolveAgentPlatformMethod(path);
  if (!classMethod) {
    throw new Error(`Agent Platform method is not mapped for path: ${path}`);
  }

  const bodyText = typeof init.body === "string" ? init.body : undefined;
  const parsedBody = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
  const location = getAgentPlatformLocation();
  const token = await getGoogleAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/${resource}/api/reasoning_engine`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        class_method: classMethod,
        input: buildAgentPlatformInput(path, parsedBody),
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    return res;
  }

  const payload = (await res.json()) as { output?: unknown; error?: string };
  if (payload.error) {
    return new Response(JSON.stringify({ error: payload.error }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(payload.output ?? payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** backend-api から agent へ JSON リクエストを送る。 */
export async function fetchAgent(
  path: string,
  init: RequestInit = {},
  timeoutMs = 240_000,
): Promise<Response> {
  if (usesAgentPlatform()) {
    return fetchAgentPlatform(path, init, timeoutMs);
  }

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
