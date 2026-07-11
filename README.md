# tabipla-app

tabipla は自治体向けの観光コンテンツ管理と、ユーザー向けの旅プラン体験を提供するモノレポです。
検索基盤は `packages/search-core` に集約し、各アプリ・サービスはそこを経由して Elasticsearch と連携します。

```text
apps/admin-web ──▶ backend-api ──▶ PostgreSQL（正本） ──▶ Elasticsearch
                 ──▶ agent（AI収集・おすすめ生成）

apps/user-web  ──▶ backend-api ──▶ agent / search-core
```

## リポジトリ構成

| パス | 説明 |
|---|---|
| `apps/admin-web` | 自治体向け管理画面（観光地 CRUD・CSV一括・AI収集） |
| `apps/user-web` | ユーザー向け Web フロント（スワイプ型レコメンド） |
| `services/backend-api` | HTTP API（認証・DB・検索連携） |
| `services/agent` | AI エージェント（収集・おすすめ・ガイド） |
| `packages/search-core` | Elasticsearch 共通モジュール |
| `packages/db` | PostgreSQL スキーマ・マイグレーション |
| `packages/domain` | カテゴリ・エリア等の横断ドメイン定数 |
| `packages/maps-core` | Google Maps Routes API（移動時間計算） |
| `infra/` | Docker / Cloud SQL / GCS / 監視 等 |

---

## リリース

### admin-web（管理画面）

自治体職員向けの観光地管理画面。**Firebase Hosting** で公開しています。

**本番ログイン**

1. Cloud SQL に seed: `bash infra/cloud-sql/seed.sh`
2. backend-api に CORS 設定 + 再デプロイ
3. admin-web を再デプロイ（`scripts/deploy.sh` が Cloud Run URL を自動埋め込み）

| 項目 | 値 |
|---|---|
| URL | https://tabipla-admin-web.web.app |
| ログイン | `admin@example.com` / `test-admin-password`（seed 後） |

**主な機能**

- ログイン（JWT / `backend-api` の `/auth/login`）
- 観光地一覧・検索・編集・削除（CSV エクスポート対応）
- 観光地追加（個別登録 / CSV 一括 / AI 収集）
- Google Maps による地図プレビュー

**本番環境の接続**

- admin-web は Firebase プロジェクト `tabipla-admin-web` のため、`/api` rewrite は使えません。
- `scripts/deploy.sh` が `VITE_API_BASE` / `VITE_AGENT_BASE` に Cloud Run URL を埋め込みます（詳細は [`apps/admin-web/README.md`](apps/admin-web/README.md)）。

---

### その他のデプロイ済みコンポーネント

| コンポーネント | ホスティング | ドキュメント |
|---|---|---|
| user-web | Firebase Hosting（`tabipla-user-web`） | [`apps/user-web/README.md`](apps/user-web/README.md) |
| backend-api | Cloud Run | [`services/backend-api/README.md`](services/backend-api/README.md) |
| agent | Cloud Run | [`services/agent/README.md`](services/agent/README.md) |

---

## 開発の始め方

```bash
# 依存インストール（リポジトリルート）
pnpm install

# インフラ（PostgreSQL / Elasticsearch）
pnpm docker:up

# backend-api
pnpm -C services/backend-api dev

# admin-web（http://localhost:5174）
pnpm -C apps/admin-web dev
```

Web 収集（AI 登録）を使う場合は `services/agent` も起動してください。手順は [`docs/setup-collect-agent.md`](docs/setup-collect-agent.md) を参照。

ユーザー向け体験をまとめて起動する場合:

```bash
pnpm dev:user   # backend-api + agent + user-web（:5173）
```

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
