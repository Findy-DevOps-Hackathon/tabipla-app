# @tabipla/agent

ADK（`@google/adk`）と Hono で動く AI エージェントサービスです。
本番は **Gemini Enterprise Agent Platform Runtime**（Agent Runtime / BYOC）上で動作します。
Gemini モデル呼び出しは **Vertex AI + ADC**（API キー不要）です。

```text
user-web  ──▶ backend-api ──▶ Agent Platform Runtime（personalizedPlan, askSpot）
admin-web ──▶ backend-api ──▶ Agent Platform Runtime（collectSpots, describeSpot, generateSpotImage）
                              └─ ADK / @google/genai → Vertex AI（ADC）
```

ローカル開発時は Hono の `/v1/*` を直接呼び出します（`AGENT_API_URL=http://localhost:8080`）。
本番の backend-api は `AGENT_PLATFORM_RESOURCE` 経由で Reasoning Engine API を呼び出します。

検索は `@tabipla/search-core` を直接利用します（`personalizedPlan` の候補ランキングなど）。

---

## 構成

| パス | 役割 |
|---|---|
| `src/server.ts` | Hono API（`/healthz`, `/v1/*`, `/api/reasoning_engine`） |
| `src/handlers.ts` | 各 API のビジネスロジック |
| `src/vertexConfig.ts` | Vertex AI + ADC クライアント |
| `src/agentPlatform/` | Agent Platform Runtime 向け class_methods |
| `src/agents/collect.ts` | 指定市区町村の観光地 Web 収集 |
| `src/agents/describe.ts` | 紹介文・おすすめポイント生成 |
| `src/agents/introduce.ts` | スポットに関するマルチモーダル Q&A |
| `src/agents/personalized.ts` | スワイプ好み学習 + ES ランキング + 紹介文生成 |
| `src/agents/intro.ts` | おすすめ一覧の導入文生成 |
| `src/agents/spotImage.ts` | スポット用スケッチ風イラスト生成 |
| `src/personalize.ts` | 好みプロファイル・スコアリング（決定的ロジック） |
| `src/internalAuth.ts` | backend-api からのサービス間トークン検証（ローカル / Cloud Run 互換） |

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `8080` | 待ち受けポート |
| `GOOGLE_GENAI_USE_VERTEXAI` | `TRUE` | ADK の Vertex backend を有効化 |
| `GOOGLE_CLOUD_PROJECT` | — | GCP プロジェクト ID |
| `GOOGLE_CLOUD_LOCATION` | `asia-northeast1` | Vertex リージョン |
| `BACKEND_API_URL` | — | backend-api のベース URL |
| `ES_NODE` | —（`.env.example` 参照） | Elasticsearch 接続先 |
| `AGENT_INTERNAL_SECRET` | 開発用既定値 | ローカル / Cloud Run 互換モード用 |

backend-api 側（本番）:

| 変数名 | 説明 |
|---|---|
| `AGENT_PLATFORM_RESOURCE` | `projects/.../reasoningEngines/...` |
| `AGENT_PLATFORM_LOCATION` | 例: `asia-northeast1` |

詳細は `.env.example` を参照してください。

---

## 起動

```bash
gcloud auth application-default login
gcloud config set project tabipla-user-web
cp .env.example .env
pnpm --filter @tabipla/agent dev
# → http://localhost:8080/healthz
```

---

## API

### Agent Platform Runtime（本番）

| class_method | 説明 |
|---|---|
| `personalizedPlan` | 好みからおすすめ一覧を生成 |
| `askSpot` | スポット Q&A |
| `collectSpots` | 観光地 Web 収集 |
| `describeSpot` | 紹介文 / highlights 生成 |
| `generateSpotImage` | スポット用イラスト生成 |

### `/v1/*`（ローカル開発 / Cloud Run 互換）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/v1/personalized/plan` | 好みからおすすめ一覧を生成 |
| POST | `/v1/spots/:id/ask` | スポット Q&A |
| POST | `/v1/collect-spots` | 観光地 Web 収集 |
| POST | `/v1/describe-spot` | 紹介文 / highlights 生成 |
| POST | `/v1/generate-spot-image` | スポット用イラスト生成 |

---

## デプロイ（Gemini Enterprise Agent Platform）

```bash
gcloud config set project tabipla-user-web
pnpm --filter @tabipla/agent run deploy
```

`deploy` は Agent Platform Runtime（BYOC）へデプロイします。
デプロイ後、`infra/agent-platform/.credentials` に `AGENT_PLATFORM_RESOURCE` が保存されます。

Cloud Run へ直接デプロイする互換モード:

```bash
pnpm --filter @tabipla/agent run deploy:cloud-run
```

### backend-api との接続

本番（Agent Platform）:

```bash
AGENT_PLATFORM_RESOURCE=projects/.../locations/asia-northeast1/reasoningEngines/...
AGENT_PLATFORM_LOCATION=asia-northeast1
```

ローカル / Cloud Run 互換:

```bash
AGENT_API_URL=http://localhost:8080
AGENT_INTERNAL_SECRET=...
```

---

## エラーハンドリング

- モデル API の 429 / quota エラーはユーザー向けに分かりやすい文言へ変換します。
- 技術詳細はサーバーログにのみ出力し、レスポンスには含めません。
- `personalizedPlan` は ES ランキングが空の場合、ルールベース推薦へフォールバックします。
