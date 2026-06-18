# @tabipla/backend-api

アプリ用の HTTP API です。**検索ロジックは持たず**、必ず `@tabipla/search-core` を経由して
Elasticsearch と連携します（ES へ直接アクセスしません）。

> 認証・DB アクセスは初期構築では対象外です。現状は search-core の検索/登録機能を
> HTTP で公開する最小構成です。

---

## 技術スタック

- TypeScript / Node.js 22+
- [Fastify](https://fastify.dev/) v5（軽量・型安全な HTTP フレームワーク）
- `@tabipla/search-core`（workspace 依存）

> **依存追加の理由:** ルーティング・JSON ハンドリング・ロギングを最小コードで実現するため
> Fastify を採用しました。ES クライアントは search-core 経由で生成し、本パッケージは
> `@elastic/elasticsearch` に直接依存しません。

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `3001` | 待ち受けポート |
| `HOST` | `0.0.0.0` | 待ち受けホスト |
| `ES_NODE` ほか | — | Elasticsearch 接続系は search-core 側で解決（`packages/search-core/README.md` 参照） |

---

## セットアップ・起動

```bash
# リポジトリルートで依存インストール
pnpm install

# search-core を先にビルド（backend-api は dist を参照する）
pnpm -C packages/search-core build

# 開発起動（ファイル監視）
pnpm -C services/backend-api dev

# もしくは本番相当
pnpm -C services/backend-api build
pnpm -C services/backend-api start
```

事前に Elasticsearch を起動しておくこと（`infra/docker` 参照）。

---

## エンドポイント

検索対象の中心エンティティは**観光スポット（Spot）**です。

| メソッド | パス | 説明 | search-core |
|---|---|---|---|
| GET | `/health` | 稼働確認 + ES ping | `pingElasticsearch` |
| POST | `/indices` | index 作成（body: `{ index? }`） | `ensureIndex` |
| POST | `/spots?refresh=true` | スポット登録(upsert) | `indexDocument` |
| PUT | `/spots/:id?refresh=true` | 部分更新 | `updateDocument` |
| DELETE | `/spots/:id?refresh=true` | 削除 | `deleteDocument` |
| GET | `/search?q=&size=&from=&index=` | キーワード検索 | `keywordSearch` |
| POST | `/search/vector` | ベクトル検索（body: `{ embedding, k?, filters? }`） | `vectorSearch` |
| POST | `/search/hybrid` | ハイブリッド検索（body: `{ query?, embedding?, ... }`） | `hybridSearch` |

### 使用例

```bash
# ヘルスチェック
curl localhost:3001/health

# index 作成
curl -X POST localhost:3001/indices

# スポット登録
curl -X POST 'localhost:3001/spots?refresh=true' \
  -H 'content-type: application/json' \
  -d '{"id":"spot-1","name":"清水寺","description":"京都の有名な寺院","category":"観光","area":"京都市","prefecture":"京都府","tags":["寺","世界遺産"],"location":{"lat":34.9948,"lon":135.785}}'

# キーワード検索
curl 'localhost:3001/search?q=京都'

# 削除
curl -X DELETE 'localhost:3001/spots/spot-1?refresh=true'
```

---

## 入力バリデーション

Fastify 組み込みの JSON Schema 検証（内部 ajv）で全エンドポイントの入力を検証します
（スキーマ定義: `src/schemas.ts`。新規依存は追加していません）。

- **型・必須・範囲**を宣言的に検証（例: `lat` は -90〜90、`size` は 0〜1000）。
- `additionalProperties: false` で**未知フィールド（typo 等）を拒否**。
- querystring の `size` / `from` は integer へ自動変換（coercion）。
- 検証違反は **400** を返し、`{ error, context, details }` 形式で原因を返却。
- ハイブリッド検索の「query または embedding のいずれか必須」はスキーマで表現できないため
  ハンドラ内で明示的に検証。
- ベクトルの**次元数**検証は search-core 側（`vectorSearch`）が担当。

```jsonc
// 400 レスポンス例（必須欠落）
{ "error": "入力値が不正です。", "context": "body", "details": "body must have required property 'description'" }
```

---

## 注意 / 未実装範囲

- **認証・認可** は未実装（対象外）。本番ではアクセス制御を必ず追加すること。
- **DB アクセス** は未実装（対象外）。
- エラーは握りつぶさず、メッセージとステータスコードで返却します（スタックは漏らしません）。
