import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 旅行者（user-web）会員向けのアクセストークン発行・検証。
 *
 * 管理画面トークン（auth.ts）とは別シークレット・別ペイロードで扱う。
 * 仕組みは同じ HMAC 署名付きの軽量トークン（base64url(payload).署名）。
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

type TokenPayload = AuthUser & {
  exp: number;
};

function getSecret(): string {
  return process.env.USER_JWT_SECRET ?? "tabipla-dev-user-secret";
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

/** 会員用のアクセストークンを発行する。 */
export function issueUserToken(user: AuthUser): string {
  const payload: TokenPayload = { ...user, exp: Date.now() + TOKEN_TTL_MS };
  const encoded = encodePayload(payload);
  return `${encoded}.${sign(encoded)}`;
}

/** トークンを検証し、会員情報を返す（不正・期限切れなら null）。 */
export function verifyUserToken(token: string): AuthUser | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payload = decodePayload(encoded);
  if (!payload || payload.exp < Date.now()) return null;

  return { id: payload.id, name: payload.name, email: payload.email };
}
