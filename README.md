# tabipla-app

tabipla は自治体向けの観光コンテンツ管理と、ユーザー向けの旅プラン体験を提供するモノレポです。
検索基盤は `packages/search-core` に集約し、各アプリ・サービスはそこを経由して Elasticsearch と連携します。

```text
apps/admin-web ──▶ backend-api ──▶ PostgreSQL（正本） ──▶ Elasticsearch
                 ──▶ agent（AI収集・プラン生成）

apps/user-web  ──▶ backend-api ──▶ agent / search-core
```

## リポジトリ構成

| パス | 説明 |
|---|---|
| `apps/admin-web` | 自治体向け管理画面（観光地 CRUD・CSV一括・AI収集） |
| `apps/user-web` | ユーザー向け Web フロント（スワイプ型レコメンド） |
| `services/backend-api` | HTTP API（認証・DB・検索連携） |
| `services/agent` | AI エージェント（収集・プラン生成） |
| `packages/search-core` | Elasticsearch 共通モジュール |
| `packages/db` | PostgreSQL スキーマ・マイグレーション |
| `infra/` | Docker / Cloud SQL 等 |

---

## リリース

### admin-web（管理画面）

自治体職員向けの観光地管理画面。**Firebase Hosting** で公開しています。

| 項目 | 内容 |
|---|---|
| URL | https://tabipla-admin-web.web.app |
| Firebase プロジェクト | `tabipla-admin-web` |
| デプロイ | `pnpm -C apps/admin-web run deploy` |

**主な機能**

- ログイン（JWT / `backend-api` の `/auth/login`）
- 観光地一覧・検索・編集・削除（CSV エクスポート対応）
- 観光地追加（個別登録 / CSV 一括 / AI 収集）
- Google Maps による地図プレビュー

**本番環境の制約**

- 開発時の `/api`・`/agent` プロキシは Vite dev server 限定です。Firebase Hosting 単体では `backend-api` / `agent` に到達できないため、**本番で CRUD や AI 収集を動かすには** `firebase.json` の rewrite でバックエンドへ転送するか、API ベース URL の切り替えが必要です（詳細は [`apps/admin-web/README.md`](apps/admin-web/README.md)）。

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

---

## 各パッケージの README

- [apps/admin-web](apps/admin-web/README.md)
- [apps/user-web](apps/user-web/README.md)
- [services/backend-api](services/backend-api/README.md)
- [services/agent](services/agent/README.md)
- [packages/search-core](packages/search-core/README.md)
- [packages/db](packages/db/README.md)
