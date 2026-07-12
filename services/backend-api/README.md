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

---

## 技術スタック

- TypeScript / Node.js 22+
- [Fastify](https://fastify.dev/) v5
- `@tabipla/db` / `@tabipla/search-core` / `@tabipla/domain`

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `3001` | 待ち受けポート |
| `HOST` | `0.0.0.0` | 待ち受けホスト |
| `DATABASE_URL` | — | PostgreSQL 接続文字列（書き込み系で必須） |
| `ES_NODE` ほか | — | Elasticsearch 接続系（`packages/search-core/README.md` 参照） |
| `EMBEDDING_PROVIDER` | `gemini`（`GOOGLE_CLOUD_PROJECT` あり） | `gemini` / `hash` |
| `GOOGLE_GENAI_USE_VERTEXAI` | `TRUE` | Vertex AI backend を有効化 |
| `GOOGLE_CLOUD_PROJECT` | — | GCP プロジェクト ID（Vertex/ADC） |
| `GOOGLE_CLOUD_LOCATION` | `asia-northeast1` | Vertex リージョン |
| `GEMINI_EMBEDDING_MODEL` | `global` → `gemini-embedding-2`、リージョン → `gemini-embedding-001` | Embeddings モデル名 |
| `GOOGLE_MAPS_API_KEY` | — | Places lookup（管理画面の住所自動補完） |
| `ADMIN_JWT_SECRET` | 開発用既定値 | 管理画面 JWT 署名鍵（本番必須） |
| `CORS_ORIGINS` | — | Firebase Hosting からの CORS 許可オリジン（カンマ区切り） |
| `AGENT_PLATFORM_RESOURCE` | — | 本番: Gemini Enterprise Agent Platform の Reasoning Engine リソース名 |
| `AGENT_PLATFORM_LOCATION` | `asia-northeast1` | Agent Platform リージョン |
| `AGENT_API_URL` | `http://localhost:8080` | ローカル / Cloud Run 互換モード用 |
| `AGENT_INTERNAL_SECRET` | 開発用既定値 | agent への内部トークン（本番必須） |
| `ES_SYNC_WORKER_ENABLED` | `true` | ES outbox のバックグラウンド再試行を有効化 |
| `ES_SYNC_RETRY_INTERVAL_MS` | `30000` | outbox 再試行のポーリング間隔（ミリ秒） |
| `ES_SYNC_BATCH_SIZE` | `20` | 1 回の再試行で処理する outbox 件数 |
| `GCS_BUCKET` ほか | — | スポット画像の GCS 保存（`infra/gcs/README.md` 参照） |

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

事前に PostgreSQL / Elasticsearch を起動しておくこと（`pnpm docker:up`）。

### メンテナンスコマンド

```bash
pnpm -C services/backend-api reindex                  # DB 全件を ES へ再投入
pnpm -C services/backend-api sync-es-outbox           # pending の ES 同期 outbox を手動処理
pnpm -C services/backend-api embed-spots              # 既存スポットの embedding 再生成
pnpm -C services/backend-api cluster-reference-spots  # 参照クラスタの再計算
```

---

## デプロイ（Cloud Run / GCP）

```bash
cp services/backend-api/.env.example services/backend-api/.env
# DATABASE_URL 等を本番値に編集

pnpm --filter @tabipla/backend-api run deploy
```

本番 Cloud Run ではサービスアカウントの ADC で Vertex AI を呼び出します（API キー不要）。
ローカルは `gcloud auth application-default login` が必要です。
`pnpm run deploy` は `package.json` の `deploy`（= `bash scripts/deploy.sh`）です。
`run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使います。

### フロントエンドとの接続

| アプリ | 接続方法 |
|---|---|
| user-web | Firebase Hosting の `/api/**` rewrite → Cloud Run `tabipla-backend-api` |
| admin-web | ビルド時に `VITE_API_BASE` へ Cloud Run URL を埋め込み（`scripts/deploy.sh` が自動取得） |

---

## 認証

| 対象 | 方式 |
|---|---|
| 管理画面 API（`/spots`, `/places/*`, `/indices`） | Bearer JWT（`POST /auth/login` で発行） |
| ユーザー向け API（`/v1/spots`, `/v1/personalized/plan` 等） | 認証不要 |
| スポット画像（`GET /uploads/spots/:filename`） | 認証不要 |

管理画面の書き込み系は JWT 必須です。ロールベース ACL は未実装です。

---

## エンドポイント

### ヘルス・認証

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/health`, `/healthz` | 稼働確認（DB + ES ping） |
| POST | `/auth/login` | 管理画面ログイン（JWT 発行） |

### スポット管理（管理画面・JWT 必須）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/spots` | 一覧・検索 |
| GET | `/spots/:id` | 1件取得 |
| POST | `/spots?refresh=true` | 登録（upsert、embedding 生成 → PG → ES） |
| POST | `/spots/bulk?refresh=true` | 一括登録 |
| PUT | `/spots/:id?refresh=true` | 部分更新 |
| DELETE | `/spots/:id?refresh=true` | 削除 |
| POST | `/spots/:id/image` | 画像アップロード |
| DELETE | `/spots/:id/image` | 画像削除 |
| GET | `/places/lookup?name=` | スポット名 → 住所・カテゴリ |

### 検索（`/indices` のみ JWT 必須）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/indices` | index 作成（JWT 必須） |
| GET | `/search?q=` | キーワード検索 |
| POST | `/search/vector` | ベクトル検索 |
| POST | `/search/hybrid` | ハイブリッド検索 |
| POST | `/search/semantic` | クエリ文字列 → embedding → vector/hybrid |
| POST | `/search/candidates` | 候補スポット検索（kNN × category） |

### ユーザー向け公開 API

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/v1/spots` | 公開スポット一覧（表示可能なもののみ） |
| GET | `/v1/spots/:id` | スポット詳細 |
| POST | `/v1/personalized/plan` | おすすめ生成（DB カタログ付与 → agent プロキシ） |
| POST | `/v1/spots/:spotId/ask` | AI ガイド質問（DB ファクト付与 → agent プロキシ） |

### 管理向け AI API（JWT 必須 → agent プロキシ）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/v1/collect-spots` | 観光地 Web 収集 |
| POST | `/v1/describe-spot` | 紹介文・おすすめポイント生成 |
| POST | `/v1/generate-spot-image` | スポット用イラスト生成 |

### その他

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/uploads/spots/:filename` | スポット画像配信（GCS 設定時は 301 リダイレクト） |

Firebase Hosting 経由では `/api` プレフィックス付きでも同じルートが利用できます（`registerApiMirrorRoutes`）。

---

## 使用例

```bash
# ヘルスチェック
curl localhost:3001/health

# 管理画面ログイン
curl -X POST localhost:3001/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"<admin-email>","password":"<password>"}'

# スポット登録（JWT 必須）
curl -X POST 'localhost:3001/spots?refresh=true' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{"id":"spot-1","name":"清水寺","description":"京都の有名な寺院","category":["観光"],"area":"京都市","prefecture":"京都府","address":"京都府京都市東山区清水"}'

# 公開スポット一覧
curl 'localhost:3001/v1/spots?prefecture=長野県&area=小諸市'

# キーワード検索
curl 'localhost:3001/search?q=京都'
```

---

## 入力バリデーション

Fastify 組み込みの JSON Schema 検証（`src/schemas.ts`）で全エンドポイントの入力を検証します。

- 型・必須・範囲を宣言的に検証
- `additionalProperties: false` で未知フィールドを拒否
- 検証違反は **400** を返し、`{ error, context, details }` 形式で原因を返却

---

## 注意 / 未実装範囲

- **ロールベース認可** は未実装（JWT の有効性のみ検証）。
- **書き込みと ES 反映は単一トランザクションではありません**。PG 成功後に ES 反映が失敗した場合、`es_sync_outbox` に積みバックグラウンドで再試行します（レスポンスに `esSyncPending: true` が付くことがあります）。手動復旧は `sync-es-outbox` または `reindex`。
- **PUT `/spots/:id` は embedding を再生成しません**。新規登録・一括登録時のみ embedding を生成して ES へ書き込みます。
- エラーは握りつぶさず、メッセージとステータスコードで返却します（スタックは漏らしません）。
