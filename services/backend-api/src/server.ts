import {
  countSpots,
  createDatabase,
  createUser,
  type Database,
  deleteSpot,
  deleteUserById,
  getAdminUserByEmail,
  getCouponsBySpotId,
  getSpotById,
  getUnchikuFactsBySpotId,
  getUserByEmail,
  hashPassword,
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
import { normalizeApiPath, registerApiMirrorRoutes } from "./apiPrefix.js";
import { extractBearerToken, isAdminApiPath, issueAdminToken, verifyAdminToken } from "./auth.js";
import { registerCors } from "./cors.js";
import { buildSpotEmbedText, embedText } from "./embedding.js";
import { patchSpotInElasticsearch, upsertSpotInElasticsearch } from "./esSync.js";
import { geocodeAddressQuery } from "./geocode.js";
import { mergeSpotRow, type SpotPatch, toNewSpotRow, toSpotDocument } from "./mapper.js";
import { buildAskFacts, buildAskFactsFromClient, type AskSpotPayload } from "./spotAskFacts.js";
import { lookupPlaceByName } from "./places.js";
import { enrichRecommendation, toAgentCatalogSpot } from "./spotCatalog.js";
import {
  deleteSpotImageFiles,
  readSpotImageFile,
  saveSpotImage,
  spotImageLegacyRedirectUrl,
} from "./spotImages.js";

/** user-web 向け公開 API の既定エリア（現状は小諸市のみ）。 */
const PUBLIC_SPOT_PREFECTURE = "長野県";
const PUBLIC_SPOT_AREA = "小諸市";
import {
  bulkSpotsSchema,
  createSpotSchema,
  deleteSpotSchema,
  ensureIndexSchema,
  geocodeSchema,
  getSpotByIdSchema,
  getSpotCouponsSchema,
  getSpotSchema,
  listPublicSpotsSchema,
  hybridSearchSchema,
  keywordSearchSchema,
  listSpotsSchema,
  loginSchema,
  placeLookupSchema,
  postRecommendationsSchema,
  postSpotImageSchema,
  postSpotStorySchema,
  searchCandidateSpotsSchema,
  semanticSearchSchema,
  travelTimesSchema,
  updateSpotSchema,
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
    bodyLimit: 10485760, // 10MB
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
  registerCors(app);
  registerApiMirrorRoutes(app);
  const client = options.client ?? createElasticsearchClient();

  // ---- スポット画像の公開配信（認証不要） ------------------------------------
  app.get<{ Params: { filename: string } }>("/uploads/spots/:filename", async (req, reply) => {
    const redirectUrl = spotImageLegacyRedirectUrl(req.params.filename);
    if (redirectUrl) {
      return reply.redirect(redirectUrl, 301);
    }

    const file = await readSpotImageFile(req.params.filename);
    if (!file) {
      return reply.code(404).send({ error: "画像が見つかりません" });
    }
    reply.header("cache-control", "public, max-age=86400");
    return reply.type(file.mimeType).send(file.buffer);
  });

  const db = options.db ?? createDatabase();
  const ownsDb = options.db === undefined;
  if (ownsDb) {
    app.addHook("onClose", async () => {
      await db.$client.end();
    });
  }

  // 起動時に検索インデックス（dense_vector マッピング込み）を用意する。
  // 登録経路（/spots, /spots/bulk）が embedding を書き込むため、最初の書き込み前に
  // 正しいマッピングが存在することを保証する（無ければ作成、既存なら何もしない）。
  // これが無いと、embedding 配列を空マッピングの index に書いた際に ES の動的マッピングが
  // 数値型を long と誤推論し、"cannot be changed from [long] to [float]" で失敗する。
  app.addHook("onReady", async () => {
    try {
      const { index, created } = await ensureIndex(client);
      app.log.info(
        `検索インデックス "${index}" を確認しました（${created ? "新規作成" : "既存"}）。`,
      );
    } catch (error) {
      app.log.error({ err: error }, "検索インデックスの初期化に失敗しました");
    }
  });

  app.addHook("onRequest", async (req, reply) => {
    if (!isAdminApiPath(normalizeApiPath(req.url))) return;

    const token = extractBearerToken(req.headers.authorization);
    if (!token || !verifyAdminToken(token)) {
      return reply.code(401).send({ error: "認証が必要です" });
    }
  });

  // 収集直後のスポットも即セマンティック検索の対象にするため、ES 反映前に embedding を生成して付与する。
  // 生成に失敗しても登録自体は止めない（キーワード検索は embedding なしでも機能するため、ベストエフォート）。
  // 既存ドキュメントに embedding があれば upsertSpotInElasticsearch 側が優先保持する（無駄な再計算はしない）。
  async function attachEmbedding(document: SpotDocument): Promise<SpotDocument> {
    try {
      const embedding = await embedText(buildSpotEmbedText(document), {
        taskType: "RETRIEVAL_DOCUMENT",
      });
      return { ...document, embedding };
    } catch (error) {
      app.log.warn(
        { err: error, spotId: document.id },
        "embedding 生成に失敗したため embedding なしで登録します",
      );
      return document;
    }
  }

  // ---- ヘルスチェック ------------------------------------------------------
  const checkHealth = async (req: any, reply: any) => {
    let esAlive = false;
    try {
      esAlive = await pingElasticsearch(client);
    } catch (e) {
      req.log.error(e);
    }

    let dbAlive = false;
    try {
      const count = await countSpots(db);
      dbAlive = typeof count === "number";
    } catch (e) {
      req.log.error(e);
    }

    if (!esAlive || !dbAlive) {
      return reply.code(500).send({ ok: false, db: dbAlive, elasticsearch: esAlive });
    }
    return { ok: true, db: dbAlive, elasticsearch: esAlive };
  };

  app.get("/health", checkHealth);
  app.get("/healthz", checkHealth);

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
      area?: string;
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
      await upsertSpotInElasticsearch(client, await attachEmbedding(document), { refresh });
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

  // ---- スポット画像アップロード（管理画面） ----------------------------------
  app.post<{
    Params: { id: string };
    Body: { mimeType: string; data: string };
    Querystring: { refresh?: string };
  }>("/spots/:id/image", { schema: postSpotImageSchema }, async (req, reply) => {
    const refresh = req.query.refresh === "true";
    const existing = await getSpotById(db, req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
    }

    try {
      const imageUrl = await saveSpotImage(req.params.id, req.body.mimeType, req.body.data);
      const row = await upsertSpot(db, mergeSpotRow(existing, { imageUrl }));
      const document = toSpotDocument(row);
      const { id, ...partial } = document;
      await patchSpotInElasticsearch(client, id, partial, { refresh });
      return document;
    } catch (error) {
      const message = error instanceof Error ? error.message : "画像の保存に失敗しました";
      return reply.code(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    "/spots/:id/image",
    { schema: deleteSpotSchema },
    async (req, reply) => {
      const refresh = req.query.refresh === "true";
      const existing = await getSpotById(db, req.params.id);
      if (!existing) {
        return reply.code(404).send({ error: `スポットが見つかりません: ${req.params.id}` });
      }

      await deleteSpotImageFiles(req.params.id);
      const row = await upsertSpot(db, { ...mergeSpotRow(existing, {}), imageUrl: null });
      const document = toSpotDocument(row);
      const { id, ...partial } = document;
      await patchSpotInElasticsearch(client, id, partial, { refresh });
      return document;
    },
  );

  // ---- スポット一括登録 (bulk upsert) --------------------------------------
  app.post<{ Body: { spots: SpotBody[] }; Querystring: { refresh?: string } }>(
    "/spots/bulk",
    { schema: bulkSpotsSchema },
    async (req) => {
      const refresh = req.query.refresh === "true";
      const rows = await upsertSpots(db, req.body.spots.map(toNewSpotRow));
      const documents = rows.map(toSpotDocument);
      // 各ドキュメントを1回だけ embedding 付与して upsert する。
      // refresh は最後の1件だけ true にして、まとめて可視化する（従来の挙動を踏襲）。
      for (const [i, document] of documents.entries()) {
        const isLast = i === documents.length - 1;
        await upsertSpotInElasticsearch(client, await attachEmbedding(document), {
          refresh: refresh && isLast,
        });
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
      await deleteSpotImageFiles(req.params.id);
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

  app.get<{
    Querystring: {
      q?: string;
      category?: string;
      prefecture?: string;
      area?: string;
      offset?: number;
      limit?: number;
      sort?: "updatedAt" | "name";
      order?: "asc" | "desc";
    };
  }>("/v1/spots", { schema: listPublicSpotsSchema }, async (req) => {
    const prefecture = req.query.prefecture ?? PUBLIC_SPOT_PREFECTURE;
    const area = req.query.area ?? PUBLIC_SPOT_AREA;
    const { rows, total } = await listSpots(db, { ...req.query, prefecture, area });
    return {
      total,
      count: rows.length,
      spots: rows.map(toSpotDocument),
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
      if (dbSpot.area !== PUBLIC_SPOT_AREA || dbSpot.prefecture !== PUBLIC_SPOT_PREFECTURE) {
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

      return { spot: toSpotDocument(dbSpot), coupons };
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

  app.post<{ Body: { transportMode: string } }>(
    "/v1/recommendations",
    { schema: postRecommendationsSchema },
    async (req) => {
      const body = req.body;
      const mockSpotId = "spot-kiyomizu";
      return {
        recommendations: [
          {
            spot: {
              id: mockSpotId,
              name: "清水寺",
              category: "isan",
              location: { lat: 34.9948, lng: 135.785 },
              address: "京都府京都市東山区清水1丁目294",
              priceYen: 400,
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
              "歴史ある寺院で、静かな自然を楽しみたいというご希望にぴったりです。現在地から15分ほどで到着し、空き時間内で十分に楽しめます。",
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
          "清水寺は、実は「釘を一本も使わずに」建てられていることで有名です。139本の大柱に支えられた「清水の舞台」は、懸造り（かけづくり）と呼ばれる伝統工法で組まれています。",
        sourceFacts: [
          {
            label: "工法",
            text: "釘を一本も使わない懸造り（かけづくり）で組まれた舞台",
          },
          {
            label: "歴史",
            text: "世界遺産に登録されている京都を代表する寺院",
          },
        ],
        talkingPoints: ["釘を一本も使わない「懸造り」", "清水の舞台から見下ろす京都の絶景"],
      };
    },
  );

  const agentApiUrl = process.env.AGENT_API_URL ?? "http://localhost:8080";

  // エージェントプロキシ：旅行プランの生成とディベート（DB カタログで enrich）
  app.post("/v1/personalized/plan", async (req, reply) => {
    const body = req.body as {
      likes?: string[];
      nopes?: string[];
      userId?: string;
      timeBudget?: string;
      origin?: string;
      travelMemory?: string;
      prefecture?: string;
      area?: string;
    };

    const prefecture = body.prefecture ?? PUBLIC_SPOT_PREFECTURE;
    const area = body.area ?? PUBLIC_SPOT_AREA;
    const { rows: dbRows } = await listSpots(db, { prefecture, area, limit: 100 });
    const catalog = dbRows.map(toAgentCatalogSpot);
    const rowById = new Map(dbRows.map((row) => [row.id, row]));
    const rowByName = new Map(dbRows.map((row) => [row.name, row]));
    const allowedIds = new Set(dbRows.map((row) => row.id));

    if (dbRows.length === 0) {
      return {
        profileSummary: "まだ好みが少なめ（もう少しスワイプすると精度が上がります）",
        recommendations: [],
        result: `${area}の観光スポットが登録されていません。`,
      };
    }

    const res = await fetch(`${agentApiUrl}/v1/personalized/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        catalog,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      recommendations?: Record<string, unknown>[];
      profileSummary?: string;
      result?: string;
      debate?: unknown;
    };
    if (!res.ok) {
      return reply.code(res.status).send(data);
    }

    if (data.recommendations?.length) {
      data.recommendations = data.recommendations
        .map((rec) => {
          const id = String(rec.id ?? "");
          const name = String(rec.name ?? "");
          const row = rowById.get(id) ?? rowByName.get(name);
          return enrichRecommendation(rec, row);
        })
        .filter((rec) => allowedIds.has(String(rec.id ?? "")));
    }

    return data;
  });

  // エージェントプロキシ：チャット質問への回答
  app.post("/v1/spots/:spotId/ask", async (req, reply) => {
    const { spotId } = req.params as { spotId: string };
    const body = req.body as {
      text?: string;
      image?: { mimeType: string; data: string };
      audio?: { mimeType: string; data: string };
      userId?: string;
      spot?: AskSpotPayload;
    };

    const dbSpot = await getSpotById(db, spotId);
    let facts: string[];
    let spotForAgent: AskSpotPayload;

    if (dbSpot) {
      const unchikuRows = await getUnchikuFactsBySpotId(db, spotId);
      facts = buildAskFacts(dbSpot, unchikuRows);
      spotForAgent = {
        name: dbSpot.name,
        description: dbSpot.description,
        highlights: dbSpot.highlights ?? [],
        tags: dbSpot.tags ?? [],
        area: dbSpot.area ?? undefined,
        prefecture: dbSpot.prefecture ?? undefined,
        address: dbSpot.address ?? undefined,
      };
    } else if (body.spot?.name?.trim()) {
      spotForAgent = body.spot;
      facts = buildAskFactsFromClient(body.spot);
      req.log.warn({ spotId }, "ask: DB に無い spotId のためクライアント情報で応答します");
    } else {
      return reply.code(404).send({ error: `スポットが見つかりません: ${spotId}` });
    }

    let res: Response;
    try {
      res = await fetch(`${agentApiUrl}/v1/spots/${spotId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          spot: spotForAgent,
          facts,
        }),
      });
    } catch (error) {
      req.log.error({ err: error, spotId }, "ask: agent への接続に失敗しました");
      return reply.code(503).send({
        error:
          "AIガイドサービスに接続できません。services/agent (8080) が起動しているか確認してください。",
      });
    }

    const data = await res.json();
    if (!res.ok) {
      return reply.code(res.status).send(data);
    }
    return data;
  });

  // エージェントプロキシ：スポットフィードバック
  app.post("/v1/personalized/feedback/spot", async (req, reply) => {
    const res = await fetch(`${agentApiUrl}/v1/personalized/feedback/spot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await res.json();
    if (!res.ok) {
      return reply.code(res.status).send(data);
    }
    return data;
  });

  // エージェントプロキシ：全体フィードバック
  app.post("/v1/personalized/feedback/trip", async (req, reply) => {
    const res = await fetch(`${agentApiUrl}/v1/personalized/feedback/trip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await res.json();
    if (!res.ok) {
      return reply.code(res.status).send(data);
    }
    return data;
  });

  // エージェントプロキシ：画像SVG配信（DB カテゴリをクエリで渡す）
  app.get("/img/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const dbSpot = await getSpotById(db, id);
    const category = dbSpot?.category?.[0]
      ? toAgentCatalogSpot(dbSpot).category
      : undefined;
    const url = category
      ? `${agentApiUrl}/img/${encodeURIComponent(id)}?category=${encodeURIComponent(category)}`
      : `${agentApiUrl}/img/${encodeURIComponent(id)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (error) {
      req.log.error({ err: error, id, agentApiUrl }, "img: agent への接続に失敗しました");
      return reply.code(503).send({ error: "画像サービスに接続できません。" });
    }
    if (!res.ok) {
      return reply.code(res.status).send();
    }
    const buffer = await res.arrayBuffer();
    reply.header("content-type", "image/svg+xml; charset=utf-8");
    reply.header("cache-control", "public, max-age=86400");
    return reply.send(Buffer.from(buffer));
  });

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
