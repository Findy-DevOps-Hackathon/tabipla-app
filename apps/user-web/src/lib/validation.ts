/**
 * ログインフォームの入力バリデーション。
 *
 * backend-api 側のスキーマ（services/backend-api/src/schemas.ts）と整合する基準で検証する。
 * 各関数はエラーメッセージ（string）を返し、問題なければ null を返す。
 */

export const EMAIL_MAX = 256;
export const PASSWORD_MAX = 128;

// 一般的なメール形式の簡易チェック（前後空白なし・1つの @・ドメインに . を含む）。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレス: 形式と長さ。 */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "メールアドレスを入力してください";
  if (email.length > EMAIL_MAX) return `メールアドレスは${EMAIL_MAX}文字以内で入力してください`;
  if (!EMAIL_PATTERN.test(email)) return "メールアドレスの形式が正しくありません";
  return null;
}

/** パスワード（ログイン時）: 既存アカウント向けに非空のみを確認する。 */
export function validateLoginPassword(value: string): string | null {
  if (!value) return "パスワードを入力してください";
  if (value.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内で入力してください`;
  return null;
}
