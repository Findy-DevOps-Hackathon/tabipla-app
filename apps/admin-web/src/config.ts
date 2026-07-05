/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: deploy.sh が tabipla-user-web（東京 Cloud Run）URL を VITE_API_BASE に埋め込む
 *   （admin-web は別 Firebase プロジェクトのため /api rewrite は使えない）
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** agent サービス（Web収集・AI文案生成）。本番は deploy.sh が東京 Cloud Run URL を埋め込む。 */
export const AGENT_BASE = import.meta.env.VITE_AGENT_BASE ?? "/agent";
