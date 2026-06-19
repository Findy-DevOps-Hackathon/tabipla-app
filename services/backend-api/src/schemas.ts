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

/** 緯度経度。範囲も検証する。 */
const geoPointSchema = {
  type: "object",
  required: ["lat", "lon"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lon: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

/** SpotDocument の任意フィールド（id を除く）。登録・更新で共有する。 */
const spotOptionalProps = {
  name: { type: "string", minLength: 1, maxLength: 512 },
  description: { type: "string", minLength: 1 },
  category: { type: "string", maxLength: 128 },
  area: { type: "string", maxLength: 256 },
  prefecture: { type: "string", maxLength: 64 },
  address: { type: "string", maxLength: 512 },
  tags: {
    type: "array",
    items: { type: "string", minLength: 1, maxLength: 64 },
    maxItems: 50,
  },
  location: geoPointSchema,
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
