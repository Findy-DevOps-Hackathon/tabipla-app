# ローカル開発環境の立ち上げ

管理画面の AI 収集を含む、ローカル開発に必要な手順です。

## 前提

- Node.js 22 以上
- pnpm（`corepack enable` で有効化）
- Docker Desktop
- [Google Cloud プロジェクト](https://console.cloud.google.com/)（`tabipla-user-web` 等）
- ローカル: `gcloud auth application-default login`（Vertex/ADC 用）

## 初回セットアップ

```bash
# リポジトリルート
corepack enable
pnpm install
pnpm build
gcloud auth application-default login
gcloud config set project tabipla-user-web
```

```bash
# agent
cd services/agent
cp .env.example .env
# GOOGLE_CLOUD_PROJECT 等を確認
```

```bash
# backend-api
cd services/backend-api
cp .env.example .env
# DATABASE_URL / GOOGLE_CLOUD_PROJECT を環境に合わせて設定
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
pnpm docker:up
```

```bash
# packages/db
pnpm -C packages/db db:migrate
pnpm -C packages/db seed
```

## アプリ起動

ターミナルを分けて起動します。

```bash
# backend-api
pnpm -C services/backend-api dev
```

```bash
# agent（AI 収集・おすすめ・ガイド）
pnpm -C services/agent dev
```

```bash
# admin-web
pnpm -C apps/admin-web dev
```

```bash
# user-web
pnpm -C apps/user-web dev
```

または user-web 一式をまとめて起動:

```bash
pnpm dev:user
```

## 動作確認

| サービス | URL |
|---|---|
| backend-api | http://localhost:3001/health |
| agent | http://localhost:8080/healthz |
| admin-web | http://localhost:5174 |
| user-web | http://localhost:5173 |

管理画面の開発用ログイン:

- seed 実行後、`seed-data/admin-users.json` の id に対応する `ADMIN_*_EMAIL` と `ADMIN_*_SEED_PASSWORD` でログイン

## よくある起動トラブル

| 症状 | 対処 |
|---|---|
| `GOOGLE_CLOUD_PROJECT が未設定` | `services/agent/.env` と `services/backend-api/.env` に Vertex 設定を追加 |
| `Could not load the default credentials` | `gcloud auth application-default login` を実行 |
| 429 / quota エラー | GCP クォータまたは Vertex のレート制限を確認 |
| `Failed to fetch` | backend-api / agent / Vite dev server の起動状況を確認 |
| `EADDRINUSE` | 既に同じポートを使っているプロセスを停止して再起動 |
| 登録や検索で失敗 | Docker の PostgreSQL / Elasticsearch 起動状況を確認 |
| AI 収集で 401 | backend-api にログインして JWT を取得しているか確認 |
