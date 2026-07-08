/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: .env.production の VITE_API_BASE に Cloud Run URL を埋め込む
 *   （admin-web は Firebase Hosting のため /api rewrite は使えない）
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/**
 * agent サービス（Web 収集・AI 文案生成）のベース URL。
 * - 開発: `/agent`（Vite が agent へプロキシ）
 * - 本番: .env.production の VITE_AGENT_BASE に Cloud Run URL を埋め込む
 */
export const AGENT_BASE = import.meta.env.VITE_AGENT_BASE ?? "/agent";
