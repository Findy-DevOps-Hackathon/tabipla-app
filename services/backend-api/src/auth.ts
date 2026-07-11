import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminAuthUser = {
  id: string;
  email: string;
  municipalityName?: string;
};

type TokenPayload = AdminAuthUser & {
  exp: number;
};

function getSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_JWT_SECRET is required in production.");
  }
  return "tabipla-dev-admin-secret";
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encoded: string): TokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (!parsed?.id || !parsed?.email || typeof parsed.exp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function sign(encoded: string): string {
  return createHmac("sha256", getSecret()).update(encoded).digest("base64url");
}

/** 管理画面用のアクセストークンを発行する。 */
export function issueAdminToken(user: AdminAuthUser): string {
  const payload: TokenPayload = {
    ...user,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${sign(encoded)}`;
}

/** トークンを検証し、ユーザー情報を返す。 */
export function verifyAdminToken(token: string): AdminAuthUser | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payload = decodePayload(encoded);
  if (!payload || payload.exp < Date.now()) return null;

  return {
    id: payload.id,
    email: payload.email,
    municipalityName: payload.municipalityName,
  };
}

/** Authorization ヘッダーから Bearer トークンを取り出す。 */
export function extractBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/** 管理画面 API かどうか（検索 API は除外）。 */
export function isAdminApiPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return (
    path === "/indices" ||
    path.startsWith("/places/") ||
    path.startsWith("/spots") ||
    path === "/v1/collect-spots" ||
    path === "/v1/describe-spot" ||
    path === "/v1/generate-spot-image"
  );
}
