# 立ち上げ方法

## 前提

- Node.js 22 以上
- pnpm（`corepack enable` で有効化）
- Docker Desktop
- gcloud CLI
- GCP プロジェクトで Vertex AI API が有効
- 実行ユーザーに Vertex AI ユーザー（`roles/aiplatform.user`）が付与済み

## 初回セットアップ

```bash
# リポジトリルート
corepack enable
corepack pnpm install
corepack pnpm build
```

```bash
# Google 認証
gcloud auth application-default login
```

```bash
# agent
cd services/agent
cp .env.example .env
# .env の GOOGLE_CLOUD_PROJECT を実プロジェクトIDに変更
```

```bash
# backend-api
cd services/backend-api
cp .env.example .env
# .env の DATABASE_URL / GOOGLE_MAPS_API_KEY を環境に合わせて設定
```

```bash
# DB
cd packages/db
cp .env.example .env
# .env の DATABASE_URL を確認
```

## ローカルインフラ起動

```bash
# リポジトリルート
corepack pnpm docker:up
```

```bash
# packages/db
corepack pnpm db:migrate
corepack pnpm seed
```

## アプリ起動

ターミナルを分けて起動します。

```bash
# backend-api
cd services/backend-api
corepack pnpm dev
```

```bash
# agent
cd services/agent
corepack pnpm dev
```

```bash
# admin-web
cd apps/admin-web
corepack pnpm dev
```

```bash
# user-web
cd apps/user-web
corepack pnpm dev
```

## 動作確認

- backend-api: `http://localhost:3001/health`
- agent: `http://localhost:8080/healthz`
- admin-web: `http://localhost:5174`
- user-web: `http://localhost:5173`

管理画面の開発用ログイン:

- email: `admin@example.com`
- password: `test-admin-password`

## よくある起動トラブル

| 症状 | 対処 |
|---|---|
| `Could not load the default credentials` | `gcloud auth application-default login` を再実行 |
| `Permission denied` / 403 | GCP IAM で Vertex AI ユーザー権限を確認 |
| 429 / quota エラー | 少し待って再実行 |
| `Failed to fetch` | backend-api / agent / Vite dev server の起動状況を確認 |
| `EADDRINUSE` | 既に同じポートを使っているプロセスを停止して再起動 |
| 登録や検索で失敗 | Docker の PostgreSQL / Elasticsearch 起動状況を確認 |
