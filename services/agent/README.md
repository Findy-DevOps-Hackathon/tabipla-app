# @tabipla/agent

ADKエージェント層。`@google/adk`（LlmAgent + FunctionTool + InMemoryRunner）で
推薦 / 旅程 / パーソナライズ(スワイプ→制約推論) / Web収集 のエージェントを提供し、Honoで公開する。

## 構成

- `src/agents/` … LlmAgent（recommend / unchiku / introduce / debate）＋ run(ask)
- `src/tools/` … FunctionTool（search/travel/unchiku）＋ `tracker.ts`（ループ監視） ＋ `dataSources.ts`（mock↔本物切替）
- `src/personalize.ts` … スワイプ好み学習（決定的）
- `src/fixtures/spots.ts` … 仮データ（後で db/search-core へ）
- `src/sceneSvg.ts` … カード用の生成SVG風景
- `src/server.ts` … API（`/`=スワイプUI, `/dev`=開発パネル, `/v1/*`）

## 起動

```bash
cp .env.example .env   # GOOGLE_CLOUD_PROJECT を自分のGCPに。ADC: gcloud auth application-default login
pnpm --filter @tabipla/agent dev
# → http://localhost:8080/
```

## デプロイ（Cloud Run / GCP）

Hono サーバを **Cloud Run** に載せます。Vertex AI（Gemini）を使うため、Firebase Hosting（user-web）と同じ GCP プロジェクト（例: `tabipla-user-web`）へのデプロイを想定しています。

### 前提

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)（`gcloud`）がインストール済み
- `gcloud auth login` 済み
- 対象プロジェクトで **Cloud Run API**・**Cloud Build API**・**Vertex AI API** が有効
- Cloud Run の実行サービスアカウントに **Vertex AI User**（`roles/aiplatform.user`）を付与

```bash
# プロジェクト指定（未設定の場合）
gcloud config set project tabipla-user-web

# ローカル開発用 ADC（任意。Cloud Run 上では実行 SA が使われる）
gcloud auth application-default login
```

### 手順

```bash
# リポジトリルートまたは services/agent から
pnpm --filter @tabipla/agent run deploy
```

`pnpm run deploy` は `package.json` の `deploy`（= `bash scripts/deploy.sh`）です。
`run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使う。

### backend-api との接続

`services/backend-api` は `AGENT_API_URL`（既定 `http://localhost:8080`）経由で agent を呼び出します。
backend-api も Cloud Run 等に載せる場合は、デプロイ後の URL を設定してください。

```bash
AGENT_API_URL=https://tabipla-agent-xxxxx-uc.a.run.app
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

## 安全対策・セーフティネットの仕様

本番公開を見据え、エージェントのトークン無駄遣いや無限ループ防止のため、以下の安全機能を搭載しています。

### 1. ツール呼び出しのループ・上限抑止
- **仕組み**: `AsyncLocalStorage` を用いて、リクエスト単位でツール実行履歴・回数を追跡しています（`src/tools/tracker.ts`）。
- **回数上限**: 1つのリクエスト内でツール実行が **5回** を超えた場合、以降の呼び出しを遮断します。
- **ループ検知**: 同一パラメータで同一ツールが連続して呼ばれた場合、ループ状態とみなし遮断します。
- **挙動**: 遮断時はLLMへエラーを返すのではなく、「手元にある情報のみで回答を簡潔にまとめて完了させてください」という指示を返すため、エージェントが途中でクラッシュせず自然に会話を終了（いい感じに切り上げ）します。

### 2. 目的外（無関係な話題）への定型拒否
- **対象**: 直接チャット入力を受ける `recommendAgent`（推薦）および `introduceAgent`（紹介）。
- **対応**: 観光地やプランに全く関係のない話題（プログラミング、雑談、有害な入力など）が入力された場合、ツールを呼び出す前に「申し訳ありませんが、当スポットの解説や観光に関するご質問以外にはお答えできません。」等の最小限の定型文で拒否し、早期終了します。

### 3. 出力トークン予算の最適化
- 各エージェントの最大出力トークン（`maxOutputTokens`）を必要最小限（例: `1024` または `800` 等）に制限し、トークン浪費を防ぎます。

### 4. 対話ログ表示の簡潔化（ディベート）
- 会議ログの1回の発言が長くなりすぎないよう、エージェント間のディベート出力（`debateOutputSchema`）に `thought` フィールドを新設しました。
- 計算や推考などの詳細な検討プロセスは裏で `thought` に出力させ、チャットUIに表示される `message` には 1〜2文（最大80文字程度）の簡潔な発言のみを出力するよう制御しています。また、議論も最大3往復に制限しています。

## 本データ結合（TODO）

`src/tools/live.ts` の `searchEs` を `@tabipla/search-core` の `searchCandidateSpots` に結線し、
`USE_MOCK=0` で切替（クエリ埋め込みは agent 側で生成して `embedding` を渡す）。
