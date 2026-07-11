# @tabipla/agent

ADK（`@google/adk`）と Hono で動く AI エージェントサービスです。
ユーザー向けのおすすめ生成・スポット質問、管理画面向けの Web 収集・文案生成・画像生成を担います。

```text
user-web ──▶ backend-api ──▶ agent（/v1/personalized/plan, /v1/spots/:id/ask）
admin-web ──▶ agent（/v1/collect-spots, /v1/describe-spot, /v1/generate-spot-image）
```

検索は `@tabipla/search-core` を直接利用します（`personalizedPlan` の候補ランキングなど）。

---

## 構成

| パス | 役割 |
|---|---|
| `src/server.ts` | Hono API（`/healthz`, `/v1/*`） |
| `src/agents/collect.ts` | 指定市区町村の観光地 Web 収集 |
| `src/agents/describe.ts` | 紹介文・おすすめポイント生成 |
| `src/agents/introduce.ts` | スポットに関するマルチモーダル Q&A |
| `src/agents/personalized.ts` | スワイプ好み学習 + ES ランキング + 紹介文生成 |
| `src/agents/intro.ts` | おすすめ一覧の導入文生成 |
| `src/agents/spotImage.ts` | スポット用スケッチ風イラスト生成 |
| `src/personalize.ts` | 好みプロファイル・スコアリング（決定的ロジック） |
| `src/fixtures/spots.ts` | `packages/db/seed-data/spots.json` 由来のモックカタログ |
| `src/adminAuth.ts` | 管理向け API の JWT 検証 |

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `8080` | 待ち受けポート |
| `GOOGLE_GENAI_USE_VERTEXAI` | — | `TRUE` で Vertex AI 経由 |
| `GOOGLE_CLOUD_PROJECT` | — | GCP プロジェクト ID |
| `GOOGLE_CLOUD_LOCATION` | —（`.env.example` で `asia-northeast1`） | Vertex AI リージョン |
| `BACKEND_API_URL` | —（`.env.example` 参照） | backend-api のベース URL |
| `ES_NODE` | —（`.env.example` 参照） | Elasticsearch 接続先 |
| `ADMIN_JWT_SECRET` | 開発用既定値 | 管理向け API の JWT 署名鍵（本番必須） |

詳細は `.env.example` を参照してください。

---

## 起動

```bash
cp .env.example .env   # GOOGLE_CLOUD_PROJECT を設定
gcloud auth application-default login   # ローカル開発用 ADC
pnpm --filter @tabipla/agent dev
# → http://localhost:8080/healthz
```

---

## API エンドポイント

### ユーザー向け（認証不要）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/healthz` | 稼働確認 |
| POST | `/v1/personalized/plan` | スワイプ好みからおすすめ一覧を生成（`catalog` 必須） |
| POST | `/v1/spots/:id/ask` | スポットに関するテキスト・画像・音声質問 |

通常は `backend-api` が DB カタログを付与してプロキシします。直接呼ぶ場合も `catalog` / `spot` / `facts` を渡してください。

### 管理向け（Bearer JWT 必須）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/v1/collect-spots` | 市区町村の観光地 Web 収集 |
| POST | `/v1/describe-spot` | 紹介文またはおすすめポイント生成 |
| POST | `/v1/generate-spot-image` | スポット用イラスト生成 |

`admin-web` からは `/agent/*` プロキシ（開発）または `VITE_AGENT_BASE`（本番ビルド）経由で呼び出します。
Cloud Run 上では `/agent/**` プレフィックスを除去するミドルウェアがあります。

---

## デプロイ（Cloud Run / GCP）

```bash
gcloud config set project tabipla-user-web
pnpm --filter @tabipla/agent run deploy
```

`pnpm run deploy` は `package.json` の `deploy`（= `bash scripts/deploy.sh`）です。
`run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使います。

### backend-api との接続

`services/backend-api` は `AGENT_API_URL`（既定 `http://localhost:8080`）経由で agent を呼び出します。

```bash
AGENT_API_URL=https://tabipla-agent-xxxxx-an.a.run.app
```

### ローカルで Docker イメージを試す

```bash
# リポジトリルートで
docker build -f services/agent/Dockerfile -t tabipla-agent .
docker run --rm -p 8080:8080 \
  -e GOOGLE_GENAI_USE_VERTEXAI=TRUE \
  -e GOOGLE_CLOUD_PROJECT=your-project \
  -e GOOGLE_CLOUD_LOCATION=asia-northeast1 \
  tabipla-agent
```

---

## エラーハンドリング

- モデル API の 429 / quota エラーはユーザー向けに「混み合っています」等へ変換します。
- 技術詳細はサーバーログにのみ出力し、レスポンスには含めません。
- `personalizedPlan` は ES ランキングが空の場合、ルールベース推薦へフォールバックします。
