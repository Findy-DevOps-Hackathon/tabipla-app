import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit は .env を自動読み込みしないため、存在すれば明示的に読み込む。
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * Drizzle Kit 設定。
 *
 * - schema: テーブル定義の場所
 * - out: 生成されるマイグレーション SQL の出力先
 * - dialect: PostgreSQL
 * - dbCredentials.url: DATABASE_URL から解決（接続情報はコードにハードコードしない）
 *
 * 利用するコマンド:
 *   - pnpm -C packages/db db:generate  … schema からマイグレーション SQL を生成
 *   - pnpm -C packages/db db:migrate   … 生成済みマイグレーションを DB へ適用
 *   - pnpm -C packages/db db:push      … schema を直接 DB へ反映（開発時の簡易反映）
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://tabipla:tabipla@localhost:5432/tabipla",
  },
  verbose: true,
  strict: true,
});
