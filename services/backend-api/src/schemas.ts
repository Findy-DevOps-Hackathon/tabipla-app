/**
 * 各エンドポイントの入力バリデーション用 JSON Schema。
 *
 * Fastify 組み込みのスキーマ検証（内部 ajv）に渡す。
 * - 型 / 必須 / 範囲 / 配列要素型 を宣言的に検証する。
 * - `additionalProperties: false` で未知フィールド（typo 等）を拒否する。
 * - querystring / params は ajv の coercion により文字列→数値へ変換される。
 *
 * 新規依存は追加していない（Fastify に同梱の ajv を利用）。
 */

/** SpotDocument の任意フィールド（id を除く）。登録・更新で共有する。 */
const spotOptionalProps = {
  name: { type: "string", minLength: 1, maxLength: 512 },
  description: { type: "string", minLength: 1, maxLength: 200 },
  category: {
    oneOf: [
      { type: "string", maxLength: 128 },
      {
        type: "array",
        items: { type: "string", minLength: 1, maxLength: 128 },
        maxItems: 3,
      },
    ],
  },
  area: { type: "string", maxLength: 256 },
  prefecture: { type: "string", maxLength: 64 },
  address: { type: "string", maxLength: 512 },
  highlights: {
    type: "array",
    items: { type: "string", minLength: 1, maxLength: 30 },
    maxItems: 5,
  },
  imageUrl: { type: "string", maxLength: 2048 },
  clusterId: { type: "integer" },
  sensoryScores: {
    type: "object",
    properties: {
      nature: { type: "number" },
      history: { type: "number" },
      art: { type: "number" },
      entertainment: { type: "number" },
      gourmet: { type: "number" },
      activity: { type: "number" },
      quietness: { type: "number" },
      indoor: { type: "number" },
      popularity: { type: "number" },
    },
    additionalProperties: false,
  },
  embedding: { type: "array", items: { type: "number" } },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
} as const;

/** refresh クエリ（"true" のときのみ即時反映）。 */
const refreshQuerystring = {
  type: "object",
  additionalProperties: false,
  properties: {
    refresh: { type: "string", enum: ["true", "false"] },
  },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1 } },
} as const;

/** POST /indices */
export const ensureIndexSchema = {
  body: {
    type: ["object", "null"],
    additionalProperties: false,
    properties: { index: { type: "string", minLength: 1 } },
  },
} as const;

/** POST /spots（登録 / upsert） */
export const createSpotSchema = {
  body: {
    type: "object",
    required: ["id", "name", "description"],
    additionalProperties: false,
    properties: {
      id: { type: "string", minLength: 1, maxLength: 512 },
      ...spotOptionalProps,
    },
  },
  querystring: refreshQuerystring,
} as const;

/** PUT /spots/:id（部分更新。id は body で変更不可、最低1フィールド必須） */
export const updateSpotSchema = {
  params: idParams,
  body: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: { ...spotOptionalProps },
  },
  querystring: refreshQuerystring,
} as const;

/** DELETE /spots/:id */
export const deleteSpotSchema = {
  params: idParams,
  querystring: refreshQuerystring,
} as const;

/** GET /spots/:id */
export const getSpotSchema = {
  params: idParams,
} as const;

/** GET /places/lookup（スポット名 → 住所など） */
export const placeLookupSchema = {
  querystring: {
    type: "object",
    required: ["name"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 512 },
      prefecture: { type: "string", maxLength: 64 },
      municipality: { type: "string", maxLength: 256 },
    },
  },
} as const;

/** GET /spots（管理画面向け一覧） */
export const listSpotsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      q: { type: "string" },
      category: { type: "string", maxLength: 128 },
      prefecture: { type: "string", maxLength: 64 },
      area: { type: "string", maxLength: 256 },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
      sort: { type: "string", enum: ["updatedAt", "name"] },
      order: { type: "string", enum: ["asc", "desc"] },
    },
  },
} as const;

const spotBodyProps = {
  id: { type: "string", minLength: 1, maxLength: 512 },
  ...spotOptionalProps,
} as const;

/** POST /spots/bulk（一括 upsert） */
export const bulkSpotsSchema = {
  body: {
    type: "object",
    required: ["spots"],
    additionalProperties: false,
    properties: {
      spots: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "name", "description"],
          additionalProperties: false,
          properties: spotBodyProps,
        },
        minItems: 1,
        maxItems: 500,
      },
    },
  },
  querystring: refreshQuerystring,
} as const;

/** GET /search（キーワード検索） */
export const keywordSearchSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      q: { type: "string" },
      size: { type: "integer", minimum: 0, maximum: 1000 },
      from: { type: "integer", minimum: 0 },
      index: { type: "string", minLength: 1 },
    },
  },
} as const;

/** POST /search/vector */
export const vectorSearchSchema = {
  body: {
    type: "object",
    required: ["embedding"],
    additionalProperties: false,
    properties: {
      embedding: { type: "array", items: { type: "number" }, minItems: 1 },
      k: { type: "integer", minimum: 1, maximum: 1000 },
      filters: { type: "object" },
      index: { type: "string", minLength: 1 },
    },
  },
} as const;

/** POST /search/hybrid（query / embedding の少なくとも一方が必要） */
export const hybridSearchSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      query: { type: "string" },
      embedding: { type: "array", items: { type: "number" }, minItems: 1 },
      filters: { type: "object" },
      size: { type: "integer", minimum: 0, maximum: 1000 },
      k: { type: "integer", minimum: 1, maximum: 1000 },
      knnBoost: { type: "number", minimum: 0 },
      index: { type: "string", minLength: 1 },
    },
  },
} as const;

/** POST /search/semantic（クエリ文字列から embedding を生成して検索） */
export const semanticSearchSchema = {
  body: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1 },
      mode: { type: "string", enum: ["vector", "hybrid"] },
      size: { type: "integer", minimum: 1, maximum: 1000 },
      k: { type: "integer", minimum: 1, maximum: 1000 },
      knnBoost: { type: "number", minimum: 0 },
      index: { type: "string", minLength: 1 },
    },
  },
} as const;

/** POST /search/candidates（A3: kNN × category） */
export const searchCandidateSpotsSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      query: { type: "string" },
      embedding: { type: "array", items: { type: "number" }, minItems: 1 },
      category: {
        anyOf: [
          { type: "string", minLength: 1 },
          {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
        ],
      },
      prefecture: {
        anyOf: [
          { type: "string", minLength: 1 },
          {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
        ],
      },
      area: {
        anyOf: [
          { type: "string", minLength: 1 },
          {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
        ],
      },
      ids: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 1,
      },
      excludeIds: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 1,
      },
      size: { type: "integer", minimum: 1, maximum: 1000 },
      k: { type: "integer", minimum: 1, maximum: 1000 },
      knnBoost: { type: "number", minimum: 0 },
      index: { type: "string", minLength: 1 },
    },
  },
} as const;

/** POST /auth/login（管理画面） */
export const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 256 },
      password: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
} as const;

/** GET /v1/spots（ユーザー向け公開一覧） */
export const listPublicSpotsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      q: { type: "string" },
      category: { type: "string", maxLength: 128 },
      prefecture: { type: "string", maxLength: 64 },
      area: { type: "string", maxLength: 256 },
      destinations: { type: "string", maxLength: 4096 },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      sort: { type: "string", enum: ["updatedAt", "name"] },
      order: { type: "string", enum: ["asc", "desc"] },
    },
  },
} as const;

/** GET /v1/spots/:id */
export const getSpotByIdSchema = {
  params: idParams,
} as const;

const spotIdParams = {
  type: "object",
  required: ["spotId"],
  additionalProperties: false,
  properties: { spotId: { type: "string", minLength: 1 } },
} as const;

/** POST /spots/:id/image（管理画面向け画像アップロード） */
export const postSpotImageSchema = {
  params: idParams,
  querystring: refreshQuerystring,
  body: {
    type: "object",
    required: ["mimeType", "data"],
    additionalProperties: false,
    properties: {
      mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
      data: { type: "string", minLength: 1 },
    },
  },
} as const;
