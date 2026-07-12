# tabipla-app

tabipla は自治体向けの観光コンテンツ管理と、ユーザー向けの比較タップ型おすすめ体験を提供するモノレポです。
Elasticsearch 連携は `packages/search-core` に集約し、**`backend-api` と `agent` が利用**します。`apps/*` は API 層のみ呼び出し、Elasticsearch には直接アクセスしません。

```text
apps/admin-web ──(/api)──▶ backend-api ──▶ PostgreSQL（正本） ──▶ Elasticsearch
                 ──(/agent)─▶ agent（Web収集・文案・画像生成）

apps/user-web  ──(/api)──▶ backend-api ──▶ PostgreSQL / search-core ──▶ Elasticsearch
                                         ──▶ agent（おすすめ・ガイド）
```

## 本番サイト

| 対象 | URL |
|---|---|
| 自治体向け（管理画面） | https://tabipla-admin-web.web.app |
| 旅行者向け | https://tabipla-user-web.web.app |

## リポジトリ構成

| パス | 説明 |
|---|---|
| `apps/admin-web` | 自治体向け管理画面（観光地 CRUD・CSV一括・AI収集） |
| `apps/user-web` | ユーザー向け Web フロント（比較タップ型おすすめ） |
| `services/backend-api` | HTTP API（認証・DB・検索連携・agent プロキシ） |
| `services/agent` | AI エージェント（収集・おすすめ・ガイド） |
| `packages/search-core` | Elasticsearch 共通モジュール |
| `packages/db` | PostgreSQL スキーマ・マイグレーション |
| `packages/domain` | カテゴリ・エリア等の横断ドメイン定数 |
| `packages/maps-core` | Google Maps Routes API（移動時間計算） |
| `infra/` | Docker / Cloud SQL / GCS / 監視 等 |

---

## デプロイ構成

設定ファイル（`.firebaserc` / `firebase.json` / 各 `scripts/deploy.sh`）に基づく配信先です。

### admin-web（自治体向けサイト）

| 項目 | 値 |
|---|---|
| Firebase プロジェクト | `tabipla-admin-web`（`apps/admin-web/.firebaserc`） |
| Hosting URL | https://tabipla-admin-web.web.app |
| API / agent | `tabipla-user-web` プロジェクトの Cloud Run（ビルド時に URL を埋め込み） |

**本番ログイン手順**

1. Cloud SQL に seed: `bash infra/cloud-sql/seed.sh`
2. backend-api に `CORS_ORIGINS` 設定 + 再デプロイ
3. admin-web を再デプロイ: `pnpm -C apps/admin-web run deploy`

| 項目 | 値 |
|---|---|
| 小諸市 ID | `komoro@example.com` |
| 小諸市 PW | `your-komoro-password` |

**主な機能**

- ログイン（JWT / `backend-api` の `/auth/login`）
- 観光地一覧・検索・編集・削除（CSV エクスポート対応）
- 観光地追加（個別登録 / CSV 一括 / AI 収集）
- Places lookup による住所の自動補完（埋め込み地図 UI はなし）

**接続の注意**

- admin-web は Firebase プロジェクト `tabipla-admin-web` のため、`/api` rewrite は使えません。
- `apps/admin-web/scripts/deploy.sh` が `VITE_API_BASE` に Cloud Run URL を埋め込みます（AI 機能も backend-api 経由）。

**デプロイ**

```bash
pnpm -C apps/admin-web run deploy
```

詳細は [`apps/admin-web/README.md`](apps/admin-web/README.md)。

### user-web（旅行者向けサイト）

| 項目 | 値 |
|---|---|
| Firebase プロジェクト | `tabipla-user-web`（`apps/user-web/.firebaserc`） |
| Hosting URL | https://tabipla-user-web.web.app |
| API | `firebase.json` の `/api/**` rewrite → Cloud Run `tabipla-backend-api`（同一オリジン） |

**主な機能**

- 比較タップ型の好み診断
- 目的地・旅の記憶に基づく AI おすすめ生成
- スポット詳細と AI ガイド（質問応答）
- 会員登録・ログインなし（訪問履歴は localStorage のみ）

**デプロイ**

```bash
pnpm -C apps/user-web run deploy
```

詳細は [`apps/user-web/README.md`](apps/user-web/README.md)。

### その他

| コンポーネント | ホスティング | 設定 |
|---|---|---|
| backend-api | Cloud Run | プロジェクト `tabipla-user-web`、サービス名 `tabipla-backend-api` |
| agent | Cloud Run | プロジェクト `tabipla-user-web`、サービス名 `tabipla-agent` |

- backend-api: [`services/backend-api/README.md`](services/backend-api/README.md)
- agent: [`services/agent/README.md`](services/agent/README.md)

---

## 開発の始め方

初回セットアップの詳細は [`docs/setup-collect-agent.md`](docs/setup-collect-agent.md) を参照。

```bash
# 依存インストール（リポジトリルート）
pnpm install

# workspace パッケージをビルド（初回。search-core / db / domain 等）
pnpm build

# インフラ（PostgreSQL / Elasticsearch）
pnpm docker:up

# DB マイグレーション + seed（初回）
pnpm -C packages/db db:migrate
pnpm -C packages/db seed

# backend-api（:3001）
pnpm -C services/backend-api dev

# admin-web（:5174）
pnpm -C apps/admin-web dev
```

AI 収集（管理画面）を使う場合は `services/agent`（:8080）も起動してください。

ユーザー向け体験をまとめて起動する場合:

```bash
pnpm dev:user   # docker:up + backend-api + agent + user-web（:5173）
```

---

## ライセンス・セキュリティ

- ライセンス: [独自ライセンス（商用利用・再配布禁止）](LICENSE)
- セキュリティ方針: [SECURITY.md](SECURITY.md)
- Public 化前チェック: `bash scripts/verify-public-release.sh`（詳細は [docs/public-release-checklist.md](docs/public-release-checklist.md)）

---

## 各パッケージの README

- [apps/admin-web](apps/admin-web/README.md)
- [apps/user-web](apps/user-web/README.md)
- [services/backend-api](services/backend-api/README.md)
- [services/agent](services/agent/README.md)
- [packages/search-core](packages/search-core/README.md)
- [packages/db](packages/db/README.md)
- [packages/domain](packages/domain/README.md)
- [packages/maps-core](packages/maps-core/README.md)
