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
  tags: {
    type: "array",
    items: { type: "string", minLength: 1, maxLength: 64 },
    maxItems: 50,
  },
  location: geoPointSchema,
  price: { type: "integer", minimum: 0 },
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

/** GET /geocode（住所 → 緯度経度） */
export const geocodeSchema = {
  querystring: {
    type: "object",
    required: ["q"],
    additionalProperties: false,
    properties: {
      q: { type: "string", minLength: 1, maxLength: 512 },
    },
  },
} as const;

/** GET /places/lookup（スポット名 → 住所・座標など） */
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

/** POST /travel-times（A4: 手段別移動時間マトリクス） */
export const travelTimesSchema = {
  body: {
    type: "object",
    required: ["origin", "destinations"],
    additionalProperties: false,
    properties: {
      origin: geoPointSchema,
      destinations: {
        type: "array",
        items: geoPointSchema,
        minItems: 1,
        maxItems: 25,
      },
      modes: {
        type: "array",
        items: { type: "string", enum: ["DRIVE", "WALK", "TRANSIT", "BICYCLE"] },
        minItems: 1,
        maxItems: 4,
      },
      departureTime: { type: "string" },
      maxDestinations: { type: "integer", minimum: 1, maximum: 25 },
    },
  },
} as const;

/** POST /search/candidates（A3: kNN × geo × price/category） */
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
      priceMin: { type: "integer", minimum: 0 },
      priceMax: { type: "integer", minimum: 0 },
      near: geoPointSchema,
      radiusKm: { type: "number", exclusiveMinimum: 0 },
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

/** 会員ログイン（user-web）。 */
export const userLoginSchema = loginSchema;

/** 会員退会（user-web）。メール・パスワードで本人確認してから削除する。 */
export const userDeleteSchema = loginSchema;

/** 会員登録（user-web）。
 *  - name: 前後空白を除いて1文字以上（空白のみは pattern で弾く）、50文字以内
 *  - email: メール形式、256文字以内
 *  - password: 8〜128文字、英字と数字を両方含む
 */
export const userRegisterSchema = {
  body: {
    type: "object",
    required: ["name", "email", "password"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 50, pattern: "\\S" },
      email: { type: "string", format: "email", maxLength: 256 },
      password: {
        type: "string",
        minLength: 8,
        maxLength: 128,
        pattern: "^(?=.*[A-Za-z])(?=.*\\d).+$",
      },
    },
  },
} as const;

/** GET /v1/spots/:id */
export const getSpotByIdSchema = {
  params: idParams,
} as const;

/** GET /v1/spots/:id/coupons */
export const getSpotCouponsSchema = {
  params: idParams,
} as const;

/** 緯度経度 (lng キー版、contracts 定義準拠) */
const locationLngSchema = {
  type: "object",
  required: ["lat", "lng"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

/** POST /v1/recommendations */
export const postRecommendationsSchema = {
  body: {
    type: "object",
    required: ["location", "availableMinutes", "transportMode", "preferences"],
    additionalProperties: false,
    properties: {
      location: locationLngSchema,
      availableMinutes: { type: "integer", minimum: 0 },
      budgetYen: { type: "integer", minimum: 0 },
      transportMode: { type: "string", enum: ["walk", "car", "transit"] },
      preferences: {
        type: "object",
        required: ["tags"],
        additionalProperties: false,
        properties: {
          tags: { type: "array", items: { type: "string" } },
          freeText: { type: "string" },
        },
      },
      excludeSpotIds: { type: "array", items: { type: "string" } },
      limit: { type: "integer", minimum: 1 },
    },
  },
} as const;

const spotIdParams = {
  type: "object",
  required: ["spotId"],
  additionalProperties: false,
  properties: { spotId: { type: "string", minLength: 1 } },
} as const;

/** POST /v1/spots/:spotId/story */
export const postSpotStorySchema = {
  params: spotIdParams,
  body: {
    type: "object",
    required: ["preferences"],
    additionalProperties: false,
    properties: {
      preferences: {
        type: "object",
        required: ["tags"],
        additionalProperties: false,
        properties: {
          tags: { type: "array", items: { type: "string" } },
          freeText: { type: "string" },
        },
      },
      tone: { type: "string" },
    },
  },
} as const;

