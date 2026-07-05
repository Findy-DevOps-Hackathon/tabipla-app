# Web収集機能（観光データ収集エージェント）セットアップ手順

管理画面の「Web収集」で、AIエージェント（Gemini + Google検索）が指定市区町村の観光地を
自動収集し、プレビュー承認後に PostgreSQL + Elasticsearch へ一括登録する機能。

git clone だけでは動かない。以下の **git外の作業** が必要。

## 関係するサービス

| サービス | ポート | 役割 |
|---|---|---|
| services/agent | 8080 | 収集エージェント（`POST /v1/collect-spots`） |
| services/backend-api | 3001 | スポット登録・ジオコーディング |
| apps/admin-web | 5174 | 管理画面（Web収集ページ） |
| PostgreSQL（Docker） | 5433 | マスターDB |
| Elasticsearch（Docker） | 9200 | 検索エンジン（登録時に自動同期） |

---

## 1. 前提ツール（未インストールなら）

- Node.js 22 以上
- pnpm（`corepack enable` で有効化）
- Docker Desktop
- [gcloud CLI](https://cloud.google.com/sdk/docs/install)（Vertex AI 認証に使う）

## 2. GCP側の準備（プロジェクト管理者が1回だけ）

1. GCPプロジェクトを用意（既存: チーム共有のプロジェクトIDを確認すること）
2. **Vertex AI API を有効化**（コンソール → API とサービス → Vertex AI API）
3. メンバーごとに IAM でロール付与: **Vertex AI ユーザー（roles/aiplatform.user）**

> Web検索は Gemini の組み込みグラウンディング機能（googleSearch）を使うため、
> **Custom Search 等の追加APIキーは不要**。

## 3. 各メンバーのローカル設定（1回だけ）

### 3-1. Google 認証（ADC）

```powershell
gcloud auth application-default login
```

ブラウザが開くので、**GCPプロジェクトへのアクセス権がある自分のGoogleアカウント**でログイン。
認証情報は `%APPDATA%\gcloud\application_default_credentials.json` に保存される。

### 3-2. .env の作成（.env は git 管理外）

```powershell
# agent
cd services/agent
copy .env.example .env
# → GOOGLE_CLOUD_PROJECT を実プロジェクトIDに書き換える

# backend-api
cd ..\backend-api
copy .env.example .env
# → DATABASE_URL はローカルDocker用のままでOK
# → GOOGLE_MAPS_API_KEY を設定（ジオコーディングに使用。チームで共有のキーを確認）
```

### 3-3. 依存インストールとDB準備

```powershell
# リポジトリルートで
corepack pnpm install
corepack pnpm build            # packages/* を dist/ にビルド

# Docker起動（postgres / elasticsearch / kibana）
cd infra\docker
docker compose up -d

# マイグレーションとシード（packages/db で）
cd ..\..\packages\db
copy .env.example .env         # DATABASE_URL を確認
corepack pnpm db:migrate
corepack pnpm seed             # 管理者アカウント等の初期データ
```

## 4. 起動（毎回）

ターミナルを3つ開く：

```powershell
# ① backend-api
cd services\backend-api
corepack pnpm dev

# ② agent
cd services\agent
corepack pnpm dev

# ③ admin-web
cd apps\admin-web
corepack pnpm dev
```

※ Docker Desktop が起動していることを先に確認（`docker ps`）。

## 5. 動作確認

1. `http://localhost:8080/healthz` → `{"ok":true}`
2. `http://localhost:3001/health` → OK
3. `http://localhost:5174` を開きログイン（開発用: `admin@example.com` / `test-admin-password`）
4. サイドバー「**Web収集**」→ 市区町村「小諸市」・目標件数10 →「収集開始」
5. 1〜2分でプレビュー一覧が出る → チェックして「登録」
6. スポット管理一覧に増えていれば成功（ES にも自動同期される）

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| 収集開始で `Could not load the default credentials` | ADC 未設定 or 期限切れ → `gcloud auth application-default login` をやり直す |
| `Permission denied` / 403 | GCPプロジェクトの IAM に Vertex AI ユーザーが付与されていない |
| 429 / quota エラー | Vertex AI のレート制限。1分待って再実行 |
| 収集開始で `Failed to fetch` | agent(8080) が起動していない。または admin-web の vite proxy（`/agent` → agentサービス）設定を確認 |
| ファイル編集後に `Failed to fetch`（curl では動く） | tsx watch の再起動失敗で**古いプロセスがポートを握ったまま**（ログに `EADDRINUSE`）。agent のターミナルを Ctrl+C で止め、タスクマネージャー等で node の残骸がいれば終了してから `corepack pnpm dev` で再起動 |
| 登録で失敗 | backend-api(3001) か Docker（postgres/ES）が起動していない |
| `drizzle-kit: not found` | `packages/db` ディレクトリで実行しているか確認 |
| スキーマ変更が反映されない | `packages/db` で `corepack pnpm build` → backend-api を再起動 |
