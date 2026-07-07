import { createHmac, timingSafeEqual } from "node:crypto";

type AdminTokenPayload = {
  id: string;
  email: string;
  municipalityName?: string;
  exp: number;
};

function getAdminSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_JWT_SECRET is required in production.");
  }
  return "tabipla-dev-admin-secret";
}

function decodePayload(encoded: string): AdminTokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as
      | AdminTokenPayload
      | undefined;
    if (!parsed?.id || !parsed.email || typeof parsed.exp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function sign(encoded: string): string {
  return createHmac("sha256", getAdminSecret()).update(encoded).digest("base64url");
}

export function extractBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export function verifyAdminToken(token: string): boolean {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  const payload = decodePayload(encoded);
  return Boolean(payload && payload.exp >= Date.now());
}
