/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: `.env.production` の `VITE_API_BASE` に Cloud Run URL を設定
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
