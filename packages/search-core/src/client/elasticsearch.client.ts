import { Client } from "@elastic/elasticsearch";

/**
 * search-core が利用する Elasticsearch クライアント型のエイリアス。
 * 外部からは実装(@elastic/elasticsearch)に直接依存しなくて済むように再 export する。
 */
export type ElasticsearchClient = Client;

/**
 * クライアント生成に利用する環境変数名。
 * 新規環境変数を説明なしに増やさない（指示書 21.）ため、ここで一覧化する。
 *
 * - ES_NODE: 接続先URL（例: http://localhost:9200）。未設定時はローカル既定値。
 * - ES_API_KEY: APIキー認証を使う場合のキー（任意）。
 * - ES_USERNAME / ES_PASSWORD: Basic認証を使う場合の資格情報（任意）。
 *
 * 認証情報はコードにハードコードせず、必ず環境変数から渡すこと（指示書 13.）。
 */
const DEFAULT_NODE = "http://localhost:9200";

/**
 * クライアント生成オプション。すべて任意で、未指定時は環境変数 → 既定値の順に解決する。
 */
export type CreateClientOptions = {
  /** 接続先URL。未指定時は ES_NODE 環境変数、さらに未設定なら localhost。 */
  node?: string;
  /** APIキー。未指定時は ES_API_KEY 環境変数。 */
  apiKey?: string;
  /** Basic認証ユーザー名。未指定時は ES_USERNAME 環境変数。 */
  username?: string;
  /** Basic認証パスワード。未指定時は ES_PASSWORD 環境変数。 */
  password?: string;
};

// クライアントは生成コストがあるため、既定オプションでの生成結果をプロセス内で再利用する。
let cachedDefaultClient: Client | undefined;

/**
 * Elasticsearch クライアントを生成する。
 *
 * クライアント生成処理はこの関数1箇所に集約する（指示書 22. 受け入れ基準）。
 * 認証情報が与えられない場合でも、ローカル開発(セキュリティ無効)では接続可能。
 *
 * @param options 生成オプション（省略時は環境変数 → 既定値で解決）
 */
export function createElasticsearchClient(
  options: CreateClientOptions = {},
): ElasticsearchClient {
  const node = options.node ?? process.env.ES_NODE ?? DEFAULT_NODE;
  const apiKey = options.apiKey ?? process.env.ES_API_KEY;
  const username = options.username ?? process.env.ES_USERNAME;
  const password = options.password ?? process.env.ES_PASSWORD;

  const auth =
    apiKey !== undefined
      ? { apiKey }
      : username !== undefined && password !== undefined
        ? { username, password }
        : undefined;

  return new Client({
    node,
    ...(auth ? { auth } : {}),
  });
}

/**
 * 既定オプションで生成した共有クライアントを返す（プロセス内シングルトン）。
 * 個別の接続設定が必要な場合は createElasticsearchClient を直接利用する。
 */
export function getDefaultClient(): ElasticsearchClient {
  if (!cachedDefaultClient) {
    cachedDefaultClient = createElasticsearchClient();
  }
  return cachedDefaultClient;
}

/**
 * Elasticsearch への疎通確認を行う。
 *
 * 接続失敗を握りつぶさず、呼び出し元が状態を判断できるよう boolean を返す。
 * 詳細なエラー内容は warn ログに残す（指示書 12. エラーハンドリング方針）。
 *
 * @param client 省略時は既定クライアント
 * @returns ping に成功したかどうか
 */
export async function pingElasticsearch(
  client: ElasticsearchClient = getDefaultClient(),
): Promise<boolean> {
  try {
    return await client.ping();
  } catch (error) {
    console.warn(
      "[search-core] Elasticsearch への ping に失敗しました:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
