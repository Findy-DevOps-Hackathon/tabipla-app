/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: .env.production の VITE_API_BASE に Cloud Run URL を埋め込む
 *   （admin-web は Firebase Hosting のため /api rewrite は使えない）
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
