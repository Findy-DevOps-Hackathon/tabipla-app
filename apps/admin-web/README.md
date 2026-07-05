# @tabipla/admin-web

tabipla の自治体向け管理画面です。`backend-api` 経由で観光地の CRUD を行い、
AI エージェントによる Web 収集結果のプレビュー・一括登録にも対応します。

**検索ロジックは持たず**、Elasticsearch / `@tabipla/search-core` には直接アクセスしません。

```text
admin-web ──(HTTP /api/*)──▶ backend-api ──▶ PostgreSQL ──▶ Elasticsearch
          ──(HTTP /agent/*)──▶ agent（Web収集・開発時プロキシ）
```

---

## 技術スタック

- TypeScript / Node.js 22+
- [React 19](https://react.dev/) + [Vite 6](https://vite.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)（`@tailwindcss/vite`）
- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)（地図プレビュー）
- [lucide-react](https://lucide.dev/)（アイコン）

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:3001` | 開発サーバが `/api` をプロキシする backend-api の接続先 |
| `VITE_AGENT_PROXY_TARGET` | `http://localhost:8080` | 開発サーバが `/agent` をプロキシする agent の接続先 |
| `VITE_API_BASE` | `/api` | 本番 API ベース URL（`.env.production` で Cloud Run URL を設定） |
| `VITE_GOOGLE_MAPS_API_KEY` | — | 地図プレビュー用（本番では HTTP リファラー制限を設定すること） |

`.env.example` を `.env.local` にコピーして編集してください。

---

## セットアップ・起動

```bash
# リポジトリルートで依存インストール
pnpm install

# backend-api + agent を起動しておく（別ターミナル）
pnpm -C services/backend-api dev
pnpm -C services/agent dev

# 管理画面開発起動（http://localhost:5174）
pnpm -C apps/admin-web dev
```

開発時は Vite dev server が `/api/*` を backend-api、`/agent/*` を agent へプロキシするため、
CORS 設定なしで API を呼び出せます（`vite.config.ts`）。

```bash
# 本番相当ビルド / プレビュー
pnpm -C apps/admin-web build
pnpm -C apps/admin-web preview
```

---

## デプロイ（Firebase Hosting / GCP）

静的 SPA を **Firebase Hosting**（GCP）で配信します。設定は `firebase.json`
（`public: dist`／SPA 用 `rewrites`／静的アセットのキャッシュ）に定義済みです。

### 公開 URL

| 項目 | 値 |
|---|---|
| Hosting URL | https://tabipla-admin-web.web.app |
| Firebase プロジェクト | `tabipla-admin-web`（`.firebaserc`） |

### 手順

```bash
cd apps/admin-web

# 1. Google アカウントでログイン（初回のみ）
pnpm exec firebase login

# 2. デプロイ先プロジェクトを指定（初回のみ）
pnpm exec firebase use tabipla-admin-web

# 3. ビルド + デプロイ
pnpm run deploy
```

> `pnpm run deploy` は `package.json` の `deploy`（= `pnpm build && firebase deploy --only hosting`）です。
> `run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使う。

---

## デプロイ時の注意事項

- **本番ログイン**は `VITE_API_BASE`（`.env.production`）で Cloud Run の backend-api URL を指し、
  backend-api 側で `CORS_ORIGINS` に `https://tabipla-admin-web.web.app` を許可すること。
  Cloud SQL には `bash infra/cloud-sql/seed.sh` で管理ユーザーを投入する。
- **`/agent/*`（AI 収集）は本番未接続**（別途 agent の Cloud Run URL と CORS が必要）。
- **`VITE_GOOGLE_MAPS_API_KEY`** はビルド時に埋め込まれるため、本番デプロイ前に
  `.env.production` 等で設定すること。API キーには Hosting ドメインのリファラー制限を推奨。
- **`dist/` はビルド成果物**なのでコミット不要（`pnpm run deploy` が毎回再生成）。

---

## 画面・機能

Figma デザイン（`docs/figma-admin-design-brief.md`）に準拠したデスクトップ向け UI（最大幅 960px）。

| 画面 | パス | 説明 |
|---|---|---|
| ログイン | `/login` | メール / パスワードで JWT 取得 |
| 観光地一覧 | `/spots` | 検索・ページング・一括削除・CSV エクスポート |
| 観光地追加 | `/spots/new` | 個別登録 / CSV 一括 / AI 収集（タブ切替） |
| 観光地編集 | `/spots/:id/edit` | 既存スポットの更新 |

**観光地追加の3モード**

1. **個別登録** — フォーム入力 + Places lookup + 地図プレビュー
2. **CSV 一括登録** — CSV アップロードで一括インポート
3. **AI 登録** — agent が指定市区町村の観光地を Web 収集 → プレビュー承認 → 一括登録

Web 収集のセットアップは [`docs/setup-collect-agent.md`](../../docs/setup-collect-agent.md) を参照。

---

## 構成

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | ルーティング・認証ガード |
| `src/auth.ts` | JWT セッション（localStorage） |
| `src/api.ts` | backend-api クライアント |
| `src/types.ts` | Spot 型定義 |
| `src/master/index.ts` | 自治体・都道府県マスタ（現状デモ: 小諸市） |
| `src/pages/SpotListPage.tsx` | 一覧・検索・削除 |
| `src/pages/SpotAddPage.tsx` | 追加タブ（個別 / CSV / AI） |
| `src/pages/SpotFormPage.tsx` | 登録・編集フォーム |
| `src/pages/CollectPage.tsx` | AI Web 収集フロー |
| `src/pages/BulkImportPage.tsx` | CSV 一括インポート |
| `src/components/layout/AdminShell.tsx` | シェル（サイドバー + ヘッダー） |
| `src/components/MapPreview.tsx` | Google Maps プレビュー |

---

## 注意 / 未実装範囲

- **自治体マスタは現状ハードコード**（`src/master/index.ts` の小諸市）。実運用では
  ログインユーザーに紐づく自治体情報を API から取得する想定。
- **認証は JWT のみ**（localStorage）。リフレッシュトークン・ロールベース ACL は未実装。
- **本番 API 接続**は Firebase rewrite または API ベース URL 切り替えが必要（上記参照）。
