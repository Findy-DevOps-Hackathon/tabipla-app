import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 開発サーバ設定。
 *
 * フロントは Elasticsearch / search-core に直接触れず、必ず backend-api(HTTP) を経由する。
 * 開発時の CORS 回避のため、`/api/*` を backend-api(既定 http://localhost:3001) へプロキシする。
 * 接続先は環境変数 `VITE_API_PROXY_TARGET` で上書き可能。
 */
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
