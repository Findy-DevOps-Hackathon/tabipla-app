import Fastify, { type FastifyInstance } from "fastify";
import {
  createElasticsearchClient,
  pingElasticsearch,
  ensureIndex,
  indexDocument,
  updateDocument,
  deleteDocument,
  keywordSearch,
  vectorSearch,
  hybridSearch,
  type ElasticsearchClient,
  type SpotDocument,
} from "@tabipla/search-core";
import {
  ensureIndexSchema,
  createSpotSchema,
  updateSpotSchema,
  deleteSpotSchema,
  keywordSearchSchema,
  vectorSearchSchema,
  hybridSearchSchema,
} from "./schemas.js";

/**
 * backend-api は検索ロジックを持たず、必ず search-core を経由して Elasticsearch を扱う。
 * （ES クライアントの生成も search-core の createElasticsearchClient に委譲する）
 *
 * 入力検証は Fastify 組み込みの JSON Schema（src/schemas.ts）で行う。
 * スキーマ違反は onRequest 後の検証段階で 400 として弾かれ、エラーハンドラが整形する。
 */

type SpotBody = SpotDocument;
type UpdateSpotBody = Partial<Omit<SpotDocument, "id">>;
type EnsureIndexBody = { index?: string } | null;
type VectorSearchBody = {
  embedding: number[];
  k?: number;
  filters?: Record<string, unknown>;
  index?: string;
};
type HybridSearchBody = {
  query?: string;
  embedding?: number[];
  filters?: Record<string, unknown>;
  size?: number;
  k?: number;
  knnBoost?: number;
  index?: string;
};

export type BuildServerOptions = {
  /** 既存クライアントを注入する場合に指定（テスト用途など）。 */
  client?: ElasticsearchClient;
};

/**
 * Fastify アプリを生成する。サーバ起動はこの関数の外（index.ts）で行う。
 */
export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true,
    // バリデーションを厳格化する:
    //   - removeAdditional:false → 未知フィールドを除去せず 400 で弾く
    //   - coerceTypes:true → querystring の文字列を integer 等へ変換（検索の size/from 用）
    //   - allErrors:true → 1件目で止めず全違反を報告
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
        allErrors: true,
      },
    },
  });
  const client = options.client ?? createElasticsearchClient();

  // ---- ヘルスチェック ------------------------------------------------------
  app.get("/health", async () => {
    const alive = await pingElasticsearch(client);
    return { ok: true, elasticsearch: alive };
  });

  // ---- index 作成 ----------------------------------------------------------
  app.post<{ Body: EnsureIndexBody }>(
    "/indices",
    { schema: ensureIndexSchema },
    async (req) => {
      return ensureIndex(client, req.body?.index);
    },
  );

  // ---- スポット登録 (upsert) ----------------------------------------------
  // 必須項目(id/name/description)・型・未知フィールド拒否はスキーマで検証する。
  app.post<{ Body: SpotBody; Querystring: { refresh?: string } }>(
    "/spots",
    { schema: createSpotSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      return indexDocument(client, req.body, { refresh });
    },
  );

  // ---- スポット更新 --------------------------------------------------------
  // 最低1フィールド(minProperties:1)・id変更不可はスキーマで検証する。
  app.put<{
    Params: { id: string };
    Body: UpdateSpotBody;
    Querystring: { refresh?: string };
  }>("/spots/:id", { schema: updateSpotSchema }, async (req) => {
    const refresh = req.query.refresh === "true";
    return updateDocument(client, req.params.id, req.body, { refresh });
  });

  // ---- スポット削除 --------------------------------------------------------
  app.delete<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    "/spots/:id",
    { schema: deleteSpotSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      return deleteDocument(client, req.params.id, { refresh });
    },
  );

  // ---- キーワード検索 ------------------------------------------------------
  // size / from はスキーマで integer に coercion 済み。
  app.get<{
    Querystring: { q?: string; size?: number; from?: number; index?: string };
  }>("/search", { schema: keywordSearchSchema }, async (req) => {
    const results = await keywordSearch(client, {
      query: req.query.q ?? "",
      size: req.query.size,
      from: req.query.from,
      index: req.query.index,
    });
    return { count: results.length, results };
  });

  // ---- ベクトル検索 --------------------------------------------------------
  // embedding 必須・要素は number はスキーマで検証。次元数の検証は search-core 側。
  app.post<{ Body: VectorSearchBody }>(
    "/search/vector",
    { schema: vectorSearchSchema },
    async (req) => {
      const results = await vectorSearch(client, {
        embedding: req.body.embedding,
        k: req.body.k,
        filters: req.body.filters,
        index: req.body.index,
      });
      return { count: results.length, results };
    },
  );

  // ---- ハイブリッド検索 ----------------------------------------------------
  // 「query または embedding の少なくとも一方」はスキーマでは表現しづらいため
  // ここで明示的に検証する（filters のみ等を弾く）。
  app.post<{ Body: HybridSearchBody }>(
    "/search/hybrid",
    { schema: hybridSearchSchema },
    async (req, reply) => {
      const { query, embedding } = req.body;
      if (!query && !(Array.isArray(embedding) && embedding.length > 0)) {
        return reply
          .code(400)
          .send({ error: "query または embedding の少なくとも一方が必要です。" });
      }
      const results = await hybridSearch(client, {
        query,
        embedding,
        filters: req.body.filters,
        size: req.body.size,
        k: req.body.k,
        knnBoost: req.body.knnBoost,
        index: req.body.index,
      });
      return { count: results.length, results };
    },
  );

  // ---- 共通エラーハンドラ --------------------------------------------------
  // search-core が送出するエラーや、スキーマ検証エラーを握りつぶさず整形して返す。
  // 内部スタックは漏らさず、メッセージとステータスのみ返す。
  app.setErrorHandler(
    (
      error: Error & {
        statusCode?: number;
        validation?: unknown[];
        validationContext?: string;
      },
      req,
      reply,
    ) => {
      req.log.error(error);

      // JSON Schema 検証エラー（400）
      if (error.validation) {
        return reply.code(400).send({
          error: "入力値が不正です。",
          context: error.validationContext,
          details: error.message,
        });
      }

      const statusCode =
        typeof error.statusCode === "number" ? error.statusCode : 500;
      reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 500).send({
        error: error.message ?? "Internal Server Error",
      });
    },
  );

  return app;
}
