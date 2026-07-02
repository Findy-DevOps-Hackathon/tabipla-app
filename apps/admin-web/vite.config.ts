import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// .env / .env.local の VITE_* も反映する（process.env だけだと shell 環境変数しか読めない）。
// 例: ポート競合時は apps/admin-web/.env.local に VITE_AGENT_PROXY_TARGET=http://localhost:8081
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dirname, ""), ...process.env };
  const apiTarget = env.VITE_API_PROXY_TARGET ?? "http://localhost:3001";
  const agentTarget = env.VITE_AGENT_PROXY_TARGET ?? "http://localhost:8080";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        // agentサービス（Web収集）。同一オリジン経由にすることでCORS不要にする。
        "/agent": {
          target: agentTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agent/, ""),
        },
      },
    },
  };
});
