/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: 未設定のまま `/api`（Firebase Hosting rewrite。Cloud Run と同一 GCP プロジェクトが必要）
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** agent サービス（Web収集・AI文案生成）。開発時は Vite が `/agent` をプロキシする。 */
export const AGENT_BASE = "/agent";
