import {
  countSpots,
  createDatabase,
  type Database,
  deleteSpot,
  getCouponsBySpotId,
  getSpotById,
  getUnchikuFactsBySpotId,
  upsertSpot,
} from "@tabipla/db";
import { getTravelTimes, type TravelTimesParams } from "@tabipla/maps-core";
import {
  createElasticsearchClient,
  deleteSpot as deleteSpotInElasticsearch,
  type ElasticsearchClient,
  ensureIndex,
  hybridSearch,
  keywordSearch,
  pingElasticsearch,
  type SpotDocument,
  searchCandidateSpots,
  vectorSearch,
} from "@tabipla/search-core";
import Fastify, { type FastifyInstance } from "fastify";
import { embedText } from "./embedding.js";
import { patchSpotInElasticsearch, upsertSpotInElasticsearch } from "./esSync.js";
import { mergeSpotRow, type SpotPatch, toNewSpotRow, toSpotDocument } from "./mapper.js";
import {
  createSpotSchema,
  deleteSpotSchema,
  ensureIndexSchema,
  getSpotByIdSchema,
  getSpotCouponsSchema,
  hybridSearchSchema,
  keywordSearchSchema,
  postRecommendationsSchema,
  postSpotStorySchema,
  searchCandidateSpotsSchema,
  semanticSearchSchema,
  travelTimesSchema,
  updateSpotSchema,
  vectorSearchSchema,
} from "./schemas.js";

/**
 * backend-api は検索ロジックを持たず、必ず search-core を経由して Elasticsearch を扱う。
 * （ES クライアントの生成も search-core の createElasticsearchClient に委譲する）
 *
 * データの正本は PostgreSQL（@tabipla/db）。書き込み系（/spots）は必ず PG に対して行い、
 * Elasticsearch へは search-core 経由で write-through 反映する（ES は検索用の写し）。
 *
 * 入力検証は Fastify 組み込みの JSON Schema（src/schemas.ts）で行う。
 * スキーマ違反は onRequest 後の検証段階で 400 として弾かれ、エラーハンドラが整形する。
 */

type SpotBody = SpotDocument;
type UpdateSpotBody = SpotPatch;
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
type SemanticSearchBody = {
  query: string;
  mode?: "vector" | "hybrid";
  size?: number;
  k?: number;
  knnBoost?: number;
  index?: string;
};
type SearchCandidateSpotsBody = {
  query?: string;
  embedding?: number[];
  category?: string | string[];
  priceMin?: number;
  priceMax?: number;
  near?: { lat: number; lon: number };
  radiusKm?: number;
  size?: number;
  k?: number;
  knnBoost?: number;
  index?: string;
};

export type BuildServerOptions = {
  /** 既存の Elasticsearch クライアントを注入する場合に指定（テスト用途など）。 */
  client?: ElasticsearchClient;
  /** 既存の DB 接続を注入する場合に指定（テスト用途など）。 */
  db?: Database;
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

  // 正本 DB（PostgreSQL）。注入が無ければ自前で生成し、その場合は終了時にクローズする。
  const db = options.db ?? createDatabase();
  const ownsDb = options.db === undefined;
  if (ownsDb) {
    app.addHook("onClose", async () => {
      await db.$client.end();
    });
  }

  // ---- ヘルスチェック ------------------------------------------------------
  app.get("/health", async () => {
    const alive = await pingElasticsearch(client);
    return { ok: true, elasticsearch: alive };
  });

  // ---- index 作成 ----------------------------------------------------------
  app.post<{ Body: EnsureIndexBody }>("/indices", { schema: ensureIndexSchema }, async (req) => {
    return ensureIndex(client, req.body?.index);
  });

  // ---- スポット登録 (upsert) ----------------------------------------------
  // 必須項目(id/name/description)・型・未知フィールド拒否はスキーマで検証する。
  // 正本(PG)へ upsert し、その結果を ES へ write-through 反映する。
  app.post<{ Body: SpotBody; Querystring: { refresh?: string } }>(
    "/spots",
    { schema: createSpotSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      const row = await upsertSpot(db, toNewSpotRow(req.body));
      const document = toSpotDocument(row);
      await upsertSpotInElasticsearch(client, document, { refresh });
      return document;
    },
  );

  // ---- スポット更新 --------------------------------------------------------
  // 最低1フィールド(minProperties:1)・id変更不可はスキーマで検証する。
  // 正本(PG)の既存行に部分更新を適用して upsert し、ES へ write-through 反映する。
  app.put<{
    Params: { id: string };
    Body: UpdateSpotBody;
    Querystring: { refresh?: string };
  }>("/spots/:id", { schema: updateSpotSchema }, async (req, reply) => {
    const refresh = req.query.refresh === "true";
    const existing = await getSpotById(db, req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
    }
    const row = await upsertSpot(db, mergeSpotRow(existing, req.body));
    const document = toSpotDocument(row);
    const { id, ...partial } = document;
    await patchSpotInElasticsearch(client, id, partial, { refresh });
    return document;
  });

  // ---- スポット削除 --------------------------------------------------------
  // 正本(PG)から削除し、ES の写しも削除する。
  app.delete<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    "/spots/:id",
    { schema: deleteSpotSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      await deleteSpot(db, req.params.id);
      const result = await deleteSpotInElasticsearch(client, req.params.id, {
        refresh,
      });
      return result;
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

  // ---- セマンティック検索（クエリ文字列 → embedding 生成 → vector/hybrid） ----
  app.post<{ Body: SemanticSearchBody }>(
    "/search/semantic",
    { schema: semanticSearchSchema },
    async (req) => {
      const mode = req.body.mode ?? "hybrid";
      const size = req.body.size ?? 30;
      const embedding = await embedText(req.body.query, {
        taskType: "RETRIEVAL_QUERY",
      });

      if (mode === "vector") {
        const results = await vectorSearch(client, {
          embedding,
          k: req.body.k ?? size,
          index: req.body.index,
        });
        return { mode, count: results.length, results };
      }

      const results = await hybridSearch(client, {
        query: req.body.query,
        embedding,
        size,
        k: req.body.k ?? size,
        knnBoost: req.body.knnBoost,
        index: req.body.index,
      });
      return { mode, count: results.length, results };
    },
  );

  // ---- 候補スポット検索（A3: kNN × geo_distance × price/category） ----
  app.post<{ Body: SearchCandidateSpotsBody }>(
    "/search/candidates",
    { schema: searchCandidateSpotsSchema },
    async (req) => {
      const results = await searchCandidateSpots(client, req.body);
      return { count: results.length, results };
    },
  );

  // ---- 移動時間マトリクス（A4: getTravelTimes） ----
  app.post<{ Body: TravelTimesParams }>(
    "/travel-times",
    { schema: travelTimesSchema },
    async (req) => {
      return getTravelTimes(req.body);
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

      const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
      reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 500).send({
        error: error.message ?? "Internal Server Error",
      });
    },
  );

  // ---- v1 Reference & Mock APIs (B5 / B7) ---------------------------------
  app.get("/v1/meta/preference-tags", async (req, reply) => {
    return {
      tags: [
        { id: "sakagura", label: "酒蔵" },
        { id: "jinja", label: "神社" },
        { id: "cafe", label: "カフェ" },
        { id: "shizen", label: "自然" },
        { id: "isan", label: "遺産" },
      ],
    };
  });

  app.get<{ Params: { id: string } }>(
    "/v1/spots/:id",
    { schema: getSpotByIdSchema },
    async (req, reply) => {
      const dbSpot = await getSpotById(db, req.params.id);
      if (!dbSpot) {
        return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
      }

      const dbCoupons = await getCouponsBySpotId(db, req.params.id);
      const coupons = dbCoupons.map((c) => ({
        id: c.id,
        spotId: c.spotId,
        title: c.title,
        description: c.description ?? undefined,
        discount: c.discount,
        conditions: c.conditions ?? undefined,
        validUntil: c.validUntil ?? undefined,
      }));

      const spot = {
        id: dbSpot.id,
        name: dbSpot.name,
        category: dbSpot.category ?? "",
        location: { lat: dbSpot.lat ?? 0, lng: dbSpot.lon ?? 0 },
        address: dbSpot.address ?? "",
        priceYen: dbSpot.price ?? 0,
        estimatedStayMinutes: 60,
        tags: dbSpot.tags ?? [],
      };

      return { spot, coupons };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/spots/:id/coupons",
    { schema: getSpotCouponsSchema },
    async (req, reply) => {
      const dbSpot = await getSpotById(db, req.params.id);
      if (!dbSpot) {
        return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
      }

      const dbCoupons = await getCouponsBySpotId(db, req.params.id);
      const coupons = dbCoupons.map((c) => ({
        id: c.id,
        spotId: c.spotId,
        title: c.title,
        description: c.description ?? undefined,
        discount: c.discount,
        conditions: c.conditions ?? undefined,
        validUntil: c.validUntil ?? undefined,
      }));

      return { coupons };
    },
  );

  app.get("/healthz", async (req, reply) => {
    let esAlive = false;
    try {
      esAlive = await pingElasticsearch(client);
    } catch (e) {
      req.log.error(e);
    }

    let dbAlive = false;
    try {
      // シンプルな動作確認クエリとしてカウントを実行
      const count = await countSpots(db);
      dbAlive = typeof count === "number";
    } catch (e) {
      req.log.error(e);
    }

    if (!esAlive || !dbAlive) {
      return reply.code(500).send({ status: "error", db: dbAlive, elasticsearch: esAlive });
    }
    return { status: "ok", db: dbAlive, elasticsearch: esAlive };
  });

  app.post<{ Body: { transportMode: string } }>(
    "/v1/recommendations",
    { schema: postRecommendationsSchema },
    async (req) => {
      const body = req.body;
      const mockSpotId = "00000000-0000-0000-0000-000000000001";
      return {
        recommendations: [
          {
            spot: {
              id: mockSpotId,
              name: "小諸城址懐古園",
              category: "isan",
              location: { lat: 36.3277, lng: 138.4144 },
              address: "長野県小諸市丁311",
              priceYen: 500,
              estimatedStayMinutes: 90,
              tags: ["isan", "shizen"],
            },
            travel: {
              mode: body.transportMode,
              travelMinutes: 15,
              distanceMeters: 5000,
            },
            fitsInTime: true,
            reason:
              "歴史ある城址公園で、静かな自然を楽しみたいというご希望にぴったりです。現在地から15分ほどで到着し、空き時間内で十分に楽しめます。",
            matchScore: 0.92,
          },
        ],
        agentMessage: "ご希望に合わせて、歴史と自然を感じられるスポットを見つけました。",
      };
    },
  );

  app.post<{ Params: { spotId: string }; Body: any }>(
    "/v1/spots/:spotId/story",
    { schema: postSpotStorySchema },
    async (req) => {
      const spotId = req.params.spotId;
      return {
        spotId,
        story:
          "小諸城址懐古園は、実は「穴城（あなじろ）」と呼ばれる全国でも珍しい城郭なんです。普通お城って高いところにありますよね？でもここは城下町よりも低い位置に造られているんです。",
        sourceFacts: [
          {
            label: "構造",
            text: "城郭が城下町よりも低い場所に位置する「穴城（あなじろ）」",
          },
          {
            label: "歴史",
            text: "明治時代に本多静六の設計で近代的な公園として整備された",
          },
        ],
        talkingPoints: ["全国でも珍しい「穴城」という構造", "島崎藤村の「千曲川旅情の歌」の舞台"],
      };
    },
  );

  return app;
}
