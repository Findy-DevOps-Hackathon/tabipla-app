import { timingSafeEqual } from "node:crypto";

/** backend-api から agent へ付与するサービス間トークンのヘッダー名。 */
export const AGENT_INTERNAL_TOKEN_HEADER = "x-tabipla-agent-token";

export function getAgentInternalSecret(): string {
  const secret = process.env.AGENT_INTERNAL_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AGENT_INTERNAL_SECRET is required in production.");
  }
  return "tabipla-dev-agent-internal-secret";
}

export function verifyAgentInternalToken(token: string | undefined): boolean {
  if (!token?.trim()) return false;
  const expected = getAgentInternalSecret();
  const actualBuffer = Buffer.from(token.trim());
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
