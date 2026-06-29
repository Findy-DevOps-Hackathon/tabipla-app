/**
 * 旅行者（user-web）向けのログインを扱うクライアント。
 *
 * 認証は backend-api（`/api/users/*`）で行い、アカウント・パスワード（ハッシュ）は
 * PostgreSQL に保存される。フロントはサーバから受け取ったトークンと公開情報のみを
 * localStorage に保持し、画面リロード後もログイン状態を復元する。
 */

import {
  validateEmail,
  validateLoginPassword,
} from "./lib/validation.ts";

const SESSION_KEY = "tabipla-user-session";
const API_BASE = "/api";

/** ログイン中ユーザーの公開情報（パスワードは含まない）。 */
export type UserAccount = {
  id: string;
  name: string;
  email: string;
};

/** localStorage に保持するセッション（トークン + 公開情報）。 */
type StoredSession = {
  token: string;
  user: UserAccount;
};

/** ログインの失敗を表すエラー。 */
export class AuthError extends Error {}

/** backend-api がエラー時に返す JSON 形（{ error, ... }）。 */
type ApiErrorBody = { error?: string };

/** 認証 API の成功レスポンス。 */
type AuthResponse = { token: string; user: UserAccount };

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage 不可時はセッション内 state のみに依存する。
  }
}

async function postAuth(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("サーバーに接続できませんでした。時間をおいて再度お試しください。");
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new AuthError(data?.error ?? `通信に失敗しました（HTTP ${res.status}）。`);
  }

  return (await res.json()) as AuthResponse;
}

/** 現在のログインセッション（未ログインなら null）。 */
export function getSession(): UserAccount | null {
  return readSession()?.user ?? null;
}

/** 認証付きリクエスト用のアクセストークン（未ログインなら null）。 */
export function getToken(): string | null {
  return readSession()?.token ?? null;
}

/** メール・パスワードでログインする。失敗時は AuthError。 */
export async function login(input: { email: string; password: string }): Promise<UserAccount> {
  const email = input.email.trim();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthError(emailError);
  const passwordError = validateLoginPassword(input.password);
  if (passwordError) throw new AuthError(passwordError);

  const { token, user } = await postAuth("/users/login", { email, password: input.password });
  writeSession({ token, user });
  return user;
}

/** 退会前の本人確認。メール・パスワードが正しいかをサーバで検証する（セッションは変更しない）。失敗時は AuthError。 */
export async function verifyCredentials(input: { email: string; password: string }): Promise<void> {
  const email = input.email.trim();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthError(emailError);
  const passwordError = validateLoginPassword(input.password);
  if (passwordError) throw new AuthError(passwordError);

  await postAuth("/users/login", { email, password: input.password });
}

/** 退会（アカウント削除）。メール・パスワードで本人確認後に削除し、セッションも破棄する。 */
export async function deleteAccount(input: { email: string; password: string }): Promise<void> {
  const email = input.email.trim();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthError(emailError);
  const passwordError = validateLoginPassword(input.password);
  if (passwordError) throw new AuthError(passwordError);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/users/delete`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ email, password: input.password }),
    });
  } catch {
    throw new AuthError("サーバーに接続できませんでした。時間をおいて再度お試しください。");
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new AuthError(data?.error ?? `通信に失敗しました（HTTP ${res.status}）。`);
  }

  // 退会したアカウントが現在のセッションと一致する場合はログアウトする。
  const current = readSession()?.user;
  if (current && current.email.toLowerCase() === email.toLowerCase()) {
    logout();
  }
}

/** ログアウト（セッションのみ削除）。 */
export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // 失敗しても致命的ではない。
  }
}
