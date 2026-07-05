/**
 * backend-api のベース URL。
 * - 開発: `/api`（Vite が backend-api へプロキシ）
 * - 本番: 未設定のまま `/api`（Firebase Hosting が同一オリジンで Cloud Run へ rewrite）
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** 現状対応している旅先（user-web の GET /v1/spots クエリに使用）。 */
export const DESTINATION_PREFECTURE = "長野県";
export const DESTINATION_AREA = "小諸市";
