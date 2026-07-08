import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

/**
 * DB 接続に使う環境変数。新規環境変数を説明なしに増やさないため、ここで一覧化する。
 *
 * - DATABASE_URL: PostgreSQL 接続文字列
 *   （例: postgresql://tabipla:tabipla@localhost:5433/tabipla）
 *
 * 認証情報はコードにハードコードせず、必ず環境変数から渡すこと。
 */
export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export type CreateDatabaseOptions = {
  /** 接続文字列。未指定時は DATABASE_URL 環境変数を使用する。 */
  connectionString?: string;
};

/**
 * Drizzle データベースインスタンスを生成する。
 *
 * 内部で接続プール（pg.Pool）を作成する。生成したプールは戻り値の `$client` から
 * 参照でき、スクリプト終了時に `await db.$client.end()` でクローズできる。
 *
 * @throws 接続文字列が解決できない場合
 */
export function createDatabase(options: CreateDatabaseOptions = {}): Database {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "[db] DATABASE_URL が未設定です。例: postgresql://tabipla:tabipla@localhost:5433/tabipla",
    );
  }

  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}
