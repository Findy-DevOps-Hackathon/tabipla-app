# @tabipla/backend-api

アプリ用の HTTP API です。**検索ロジックは持たず**、必ず `@tabipla/search-core` を経由して
Elasticsearch と連携します（ES へ直接アクセスしません）。

データの**正本は PostgreSQL（`@tabipla/db`）**です。書き込み系（`/spots`）は必ず PG へ書き込み、
その結果を search-core 経由で Elasticsearch へ **write-through 反映**します（ES は検索用の写し）。

```text
書き込み: クライアント ─▶ backend-api ─▶ PostgreSQL(正本) ─▶ (write-through) Elasticsearch
検索:     クライアント ─▶ backend-api ─▶ search-core ─▶ Elasticsearch
一括同期: PostgreSQL ──reindex──▶ Elasticsearch（全件の再投入）
```

> 認証は初期構築では対象外です。書き込み系は `DATABASE_URL`（PG 接続）が必要です。

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
| `DATABASE_URL` | — | PostgreSQL 接続文字列（書き込み系 `/spots` と `reindex` で必須。`@tabipla/db` が解決） |
| `ES_NODE` ほか | — | Elasticsearch 接続系は search-core 側で解決（`packages/search-core/README.md` 参照） |
| `AGENT_API_URL` | `http://localhost:8080` | AIエージェントサービス（`@tabipla/agent`）のベースURL |

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

事前に Elasticsearch およびエージェントサービスを起動しておくこと（`infra/docker` 参照）。

---

## デプロイ（Cloud Run / GCP）

`@tabipla/agent` と同様、**Cloud Run** に載せます。workspace 依存（`@tabipla/db` / `@tabipla/search-core` / `@tabipla/maps-core`）を含めてビルドします。

### 前提

- 課金有効な GCP プロジェクト（例: `tabipla-user-web`）
- Cloud Run / Cloud Build API が有効
- **PostgreSQL**（Cloud SQL 等）の `DATABASE_URL` が Cloud Run から到達可能
- Elasticsearch を使う場合は `ES_NODE` 等（search-core 参照）
- `tabipla-agent` を先にデプロイしておくと `AGENT_API_URL` を自動取得

### 手順

```bash
# 1. 環境変数を用意（ローカル .env でも可）
cp services/backend-api/.env.example services/backend-api/.env
# DATABASE_URL 等を本番値に編集

# 2. デプロイ
pnpm --filter @tabipla/backend-api run deploy
```

`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` は環境変数で上書きできます。
`pnpm run deploy` は `package.json` の `deploy`（= `bash scripts/deploy.sh`）です。
`run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使う。

### user-web との接続

Firebase Hosting から `/api/*` で呼ぶには、以下いずれかが必要です。

- `firebase.json` に `/api/**` → Cloud Run への rewrite を追加
- または `apps/user-web/src/api.ts` の `API_BASE` を Cloud Run URL に変更（CORS 設定も必要）

---

## エンドポイント

検索およびAIエージェント関連のAPIを提供します。

### 検索・スポット管理（Elasticsearch / DB 連携）

| メソッド | パス | 説明 | データの流れ |
|---|---|---|---|
| GET | `/health` | 稼働確認 + ES ping | `pingElasticsearch` |
| POST | `/indices` | index 作成（body: `{ index? }`） | `ensureIndex` |
| POST | `/spots?refresh=true` | スポット登録(upsert) | PG upsert → ES `indexDocument`（write-through） |
| PUT | `/spots/:id?refresh=true` | 部分更新（存在しない id は 404） | PG 既存行に merge して upsert → ES 反映 |
| DELETE | `/spots/:id?refresh=true` | 削除 | PG `deleteSpot` → ES `deleteDocument` |
| GET | `/search?q=&size=&from=&index=` | キーワード検索 | `keywordSearch`（ES） |
| POST | `/search/vector` | ベクトル検索（body: `{ embedding, k?, filters? }`） | `vectorSearch`（ES） |
| POST | `/search/hybrid` | ハイブリッド検索（body: `{ query?, embedding?, ... }`） | `hybridSearch`（ES） |

### AIエージェントプロキシ・モック

| メソッド | パス | 説明 | データの流れ |
|---|---|---|---|
| POST | `/v1/personalized/plan` | 好み学習およびエージェント間ディベートによる旅行プラン生成 | エージェントサービスプロキシ |
| POST | `/v1/spots/:spotId/ask` | 紹介エージェントへのスポットに関するチャット質問 | エージェントサービスプロキシ |
| POST | `/v1/personalized/feedback/spot` | スポット個別Good/Bad評価によるプロファイル学習更新 | エージェントサービスプロキシ |
| POST | `/v1/personalized/feedback/trip` | 全体フィードバックによるプロファイル学習更新 | エージェントサービスプロキシ |
| GET | `/img/:id` | スポットカード用の生成SVG画像の配信 | エージェントサービスプロキシ |

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
- **書き込みと ES 反映は単一トランザクションではありません**。PG 書き込み成功後に ES 反映で
  失敗した場合、一時的に PG と ES がズレることがあります（復旧は `reindex` で全件再同期）。
- **embedding は write-through で保持されません**。`/spots` 登録時に ES の既存ドキュメントを
  上書きするため、ES 側に保持していたベクトルは消えます（embedding 生成は別タスク・対象外）。
- エラーは握りつぶさず、メッセージとステータスコードで返却します（スタックは漏らしません）。
