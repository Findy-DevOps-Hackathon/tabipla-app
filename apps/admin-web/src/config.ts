/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: `.env.production` の `VITE_API_BASE` に Cloud Run URL を設定
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** agent サービス（Web収集・AI文案生成）。開発時は Vite が `/agent` をプロキシする。 */
export const AGENT_BASE = "/agent";
