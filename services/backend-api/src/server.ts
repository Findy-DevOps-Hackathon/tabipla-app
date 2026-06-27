import {
  createCoupon,
  createDatabase,
  createRecommendation,
  createUser,
  type Database,
  deleteCoupon,
  deleteRecommendation,
  deleteSpot,
  deleteUserById,
  getAdminUserByEmail,
  getSpotById,
  getUserByEmail,
  hashPassword,
  listCoupons,
  listCouponsBySpot,
  listCouponsWithSpotName,
  listRecommendations,
  listRecommendationsBySpot,
  listSpots,
  upsertSpot,
  upsertSpots,
  verifyPassword,
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
import { extractBearerToken, isAdminApiPath, issueAdminToken, verifyAdminToken } from "./auth.js";
import { embedText } from "./embedding.js";
import { patchSpotInElasticsearch, upsertSpotInElasticsearch } from "./esSync.js";
import { geocodeAddressQuery } from "./geocode.js";
import { mergeSpotRow, type SpotPatch, toNewSpotRow, toSpotDocument } from "./mapper.js";
import { lookupPlaceByName } from "./places.js";
import {
  bulkSpotsSchema,
  createSpotSchema,
  deleteSpotSchema,
  ensureIndexSchema,
  geocodeSchema,
  getSpotSchema,
  hybridSearchSchema,
  keywordSearchSchema,
  listSpotsSchema,
  loginSchema,
  placeLookupSchema,
  searchCandidateSpotsSchema,
  semanticSearchSchema,
  travelTimesSchema,
  updateSpotSchema,
  createCouponSchema,
  createRecommendationSchema,
  deleteCouponSchema,
  deleteRecommendationSchema,
  listCouponsBySpotSchema,
  listRecommendationsBySpotSchema,
  userDeleteSchema,
  userLoginSchema,
  userRegisterSchema,
  vectorSearchSchema,
} from "./schemas.js";
import { issueUserToken } from "./userAuth.js";

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

  app.addHook("onRequest", async (req, reply) => {
    if (!isAdminApiPath(req.url)) return;

    const token = extractBearerToken(req.headers.authorization);
    if (!token || !verifyAdminToken(token)) {
      return reply.code(401).send({ error: "認証が必要です" });
    }
  });

  // ---- ヘルスチェック ------------------------------------------------------
  app.get("/health", async () => {
    const alive = await pingElasticsearch(client);
    return { ok: true, elasticsearch: alive };
  });

  // ---- 管理画面ログイン ----------------------------------------------------
  app.post<{ Body: { email: string; password: string } }>(
    "/auth/login",
    { schema: loginSchema },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const user = await getAdminUserByEmail(db, email);
      if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "メールアドレスまたはパスワードが正しくありません" });
      }

      const token = issueAdminToken({
        id: user.id,
        email: user.email,
        municipalityName: user.municipalityName ?? undefined,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          municipalityName: user.municipalityName ?? undefined,
        },
      };
    },
  );

  // ---- 会員登録（user-web） ------------------------------------------------
  app.post<{ Body: { name: string; email: string; password: string } }>(
    "/users/register",
    { schema: userRegisterSchema },
    async (req, reply) => {
      const name = req.body.name.trim();
      const email = req.body.email.trim().toLowerCase();

      const existing = await getUserByEmail(db, email);
      if (existing) {
        return reply.code(409).send({ error: "このメールアドレスは既に登録されています" });
      }

      const passwordHash = await hashPassword(req.body.password);
      const user = await createUser(db, { name, email, passwordHash });
      const token = issueUserToken({ id: user.id, name: user.name, email: user.email });

      return reply.code(201).send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
    },
  );

  // ---- 会員ログイン（user-web） --------------------------------------------
  app.post<{ Body: { email: string; password: string } }>(
    "/users/login",
    { schema: userLoginSchema },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const user = await getUserByEmail(db, email);
      if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "メールアドレスまたはパスワードが正しくありません" });
      }

      const token = issueUserToken({ id: user.id, name: user.name, email: user.email });
      return {
        token,
        user: { id: user.id, name: user.name, email: user.email },
      };
    },
  );

  // ---- 会員退会（user-web） ------------------------------------------------
  // メール・パスワードで本人確認のうえアカウントを削除する。
  app.post<{ Body: { email: string; password: string } }>(
    "/users/delete",
    { schema: userDeleteSchema },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const user = await getUserByEmail(db, email);
      if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "メールアドレスまたはパスワードが正しくありません" });
      }

      await deleteUserById(db, user.id);
      return reply.code(200).send({ ok: true });
    },
  );

  // ---- クーポン（公開: スポット別一覧） ------------------------------------
  app.get<{ Querystring: { spotId: string } }>(
    "/coupons",
    { schema: listCouponsBySpotSchema },
    async (req) => {
      return listCouponsBySpot(db, req.query.spotId);
    },
  );

  // ---- クーポン（公開: 全件＋スポット名付き） --------------------------------
  app.get("/coupons/list", async () => {
    return listCouponsWithSpotName(db);
  });

  // ---- クーポン管理（自治体） ------------------------------------------------
  app.get("/admin/coupons", async () => {
    return listCoupons(db);
  });

  app.post<{
    Body: { spotId: string; title: string; description?: string; discountPercent: number };
  }>("/admin/coupons", { schema: createCouponSchema }, async (req, reply) => {
    const spot = await getSpotById(db, req.body.spotId);
    if (!spot) {
      return reply.code(404).send({ error: "指定されたスポットが見つかりません" });
    }
    return reply.code(201).send(await createCoupon(db, req.body));
  });

  app.delete<{ Params: { id: string } }>(
    "/admin/coupons/:id",
    { schema: deleteCouponSchema },
    async (req) => {
      await deleteCoupon(db, req.params.id);
      return { ok: true };
    },
  );

  // ---- おすすめ店（公開: スポット別一覧） ------------------------------------
  app.get<{ Querystring: { spotId: string } }>(
    "/recommendations",
    { schema: listRecommendationsBySpotSchema },
    async (req) => {
      return listRecommendationsBySpot(db, req.query.spotId);
    },
  );

  // ---- おすすめ店管理（自治体） ------------------------------------------------
  app.get("/admin/recommendations", async () => {
    return listRecommendations(db);
  });

  app.post<{
    Body: {
      spotId: string;
      type: string;
      name: string;
      address?: string;
      lat?: number;
      lon?: number;
      comment?: string;
      url?: string;
    };
  }>("/admin/recommendations", { schema: createRecommendationSchema }, async (req, reply) => {
    const spot = await getSpotById(db, req.body.spotId);
    if (!spot) {
      return reply.code(404).send({ error: "指定されたスポットが見つかりません" });
    }
    return reply.code(201).send(await createRecommendation(db, req.body));
  });

  app.delete<{ Params: { id: string } }>(
    "/admin/recommendations/:id",
    { schema: deleteRecommendationSchema },
    async (req) => {
      await deleteRecommendation(db, req.params.id);
      return { ok: true };
    },
  );

  // ---- index 作成 ----------------------------------------------------------
  app.post<{ Body: EnsureIndexBody }>("/indices", { schema: ensureIndexSchema }, async (req) => {
    return ensureIndex(client, req.body?.index);
  });

  // ---- ジオコーディング（管理画面） ----------------------------------------
  app.get<{ Querystring: { q: string } }>(
    "/geocode",
    { schema: geocodeSchema },
    async (req, reply) => {
      const location = await geocodeAddressQuery(req.query.q);
      if (!location) {
        return reply.code(404).send({ error: "住所から座標を取得できませんでした" });
      }
      return location;
    },
  );

  // ---- スポット名検索（管理画面フォーム自動入力） --------------------------
  app.get<{
    Querystring: { name: string; prefecture?: string; municipality?: string };
  }>("/places/lookup", { schema: placeLookupSchema }, async (req, reply) => {
    const prefecture = req.query.prefecture ?? "長野県";
    const municipality = req.query.municipality ?? "小諸市";
    const name = req.query.name.trim();

    const result = await lookupPlaceByName(name, { prefecture, municipality });
    if (result) return result;

    // 外部 API で見つからない場合のみ、登録済みスポット（同一都道府県・名称一致）を参照
    const { rows } = await listSpots(db, { q: name, prefecture, limit: 20 });
    const dbMatch = rows.find((row) => row.name === name);
    if (dbMatch && dbMatch.lat != null && dbMatch.lon != null) {
      return {
        name: dbMatch.name,
        address: dbMatch.address ?? undefined,
        lat: dbMatch.lat,
        lon: dbMatch.lon,
        category: dbMatch.category ?? undefined,
        description: dbMatch.description,
      };
    }

    return reply.code(404).send({ error: "スポット名から情報を取得できませんでした" });
  });

  // ---- スポット一覧（管理画面） --------------------------------------------
  app.get<{
    Querystring: {
      q?: string;
      category?: string;
      prefecture?: string;
      offset?: number;
      limit?: number;
      sort?: "updatedAt" | "name";
      order?: "asc" | "desc";
    };
  }>("/spots", { schema: listSpotsSchema }, async (req) => {
    const { rows, total } = await listSpots(db, req.query);
    return {
      total,
      count: rows.length,
      spots: rows.map(toSpotDocument),
    };
  });

  // ---- スポット1件取得 ------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/spots/:id",
    { schema: getSpotSchema },
    async (req, reply) => {
      const existing = await getSpotById(db, req.params.id);
      if (!existing) {
        return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
      }
      return toSpotDocument(existing);
    },
  );

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

  // ---- スポット一括登録 (bulk upsert) --------------------------------------
  app.post<{ Body: { spots: SpotBody[] }; Querystring: { refresh?: string } }>(
    "/spots/bulk",
    { schema: bulkSpotsSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      const rows = await upsertSpots(db, req.body.spots.map(toNewSpotRow));
      const documents = rows.map(toSpotDocument);
      for (const document of documents) {
        await upsertSpotInElasticsearch(client, document, { refresh: false });
      }
      const lastDocument = documents.at(-1);
      if (refresh && lastDocument) {
        await upsertSpotInElasticsearch(client, lastDocument, { refresh: true });
      }
      return { count: documents.length, spots: documents };
    },
  );

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

  return app;
}
