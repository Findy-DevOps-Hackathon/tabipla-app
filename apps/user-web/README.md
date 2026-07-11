# @tabipla/user-web

tabipla のユーザー向け Web フロントエンドです。スワイプ型の好み診断と、AI によるおすすめ生成・スポットガイドを提供します。

**検索ロジックは持たず**、Elasticsearch / `@tabipla/search-core` には直接アクセスしません。
API は開発時に Vite dev server が `/api` を `backend-api` へプロキシします。

```text
user-web ──(HTTP /api/v1/*)──▶ backend-api ──▶ PostgreSQL / Elasticsearch
         ──(HTTP /api/v1/personalized/*)──▶ backend-api ──▶ agent
```

会員登録・ログイン機能は提供しません（訪問履歴は localStorage のみ）。

---

## 技術スタック

- TypeScript / Node.js 22+
- [React 19](https://react.dev/) + [Vite 6](https://vite.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)（`@tailwindcss/vite`）

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:3001` | 開発サーバが `/api` をプロキシする backend-api の接続先 |
| `VITE_API_BASE` | `/api` | 本番 API ベース URL（通常は未設定のまま。Firebase rewrite を利用） |

---

## セットアップ・起動

```bash
# リポジトリルートで依存インストール
pnpm install

# 一括起動（PostgreSQL + backend-api + agent + user-web）
pnpm dev:user
# → http://localhost:5173

# 個別起動する場合
pnpm docker:up
pnpm -C services/backend-api dev   # :3001
pnpm -C services/agent dev         # :8080
pnpm -C apps/user-web dev          # :5173
```

### ローカルで AI ガイド・おすすめを動かす

| 設定 | 内容 |
|------|------|
| `services/backend-api/.env` | `AGENT_API_URL=http://localhost:8080` |
| `services/agent/.env` | `GOOGLE_CLOUD_PROJECT` 等（`.env.example` 参照） |
| Gemini | `gcloud auth application-default login` で Vertex AI 認証 |

管理画面または seed でスポットが DB に登録されていること。

```bash
# 本番相当ビルド / プレビュー
pnpm -C apps/user-web build
pnpm -C apps/user-web preview
```

---

## デプロイ（Firebase Hosting / GCP）

```bash
cd apps/user-web
pnpm exec firebase login          # 初回のみ
pnpm exec firebase use --add      # 初回のみ
pnpm run deploy
```

成功すると `Hosting URL: https://<project-id>.web.app` が表示されます。

> `pnpm run deploy` は `package.json` の `deploy`（= `pnpm build && firebase deploy --only hosting`）です。
> `run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使います。

### 本番 API 接続

- `firebase.json` の `/api/**` rewrite で **同一オリジン**（`tabipla-user-web.web.app/api/...`）経由で Cloud Run `tabipla-backend-api` に転送されます。
- `VITE_API_BASE` は **設定不要**（既定 `/api` のままデプロイ）。
- GCS 画像は直 URL。ローカル保存画像は `/api/uploads/spots/...` 経由で配信されます。

---

## 画面・機能

スワイプ型のレコメンド体験（モバイルファースト 390×844）。

1. **ようこそ**（`WelcomeScreen`）— 挨拶、「好み診断を始める」
2. **スワイプ**（`SwipeScreen`）— スポットカードを左右スワイプ（好き / 興味なし）
3. **目的地入力**（`InputScreen`）— 市区町村・都道府県を入力、サジェスト表示
4. **旅の記憶**（`MemoryScreen`）— 過去の旅行体験を自由記述
5. **分析中**（`ProcessingScreen`）— `POST /api/v1/personalized/plan` でおすすめ生成
6. **おすすめ一覧**（`RecommendationsScreen`）— おすすめ理由・相性スコア付きカード
7. **スポット詳細モーダル**（`SpotDetailModal`）— AI ガイド（`POST /api/v1/spots/:id/ask`）

---

## データの出所

| 用途 | データソース |
|---|---|
| 好み診断の比較カード | `src/data/comparisonSpots.ts`（`packages/db/seed-data/spots.json` 由来） |
| 目的地内のスワイプ・おすすめ | `GET /api/v1/spots`（`src/lib/spotCatalog.ts`） |
| おすすめ生成 | `POST /api/v1/personalized/plan`（backend-api → agent） |

---

## 構成

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | フロー全体のステップ状態機械 |
| `src/components/PhoneShell.tsx` | 端末フレーム |
| `src/components/SpotDetailModal.tsx` | スポット詳細 + AI ガイド |
| `src/screens/*.tsx` | 各ステップの画面 |
| `src/data/comparisonSpots.ts` | 好み診断用の比較カードプール |
| `src/data/spots.ts` | 型定義・定数 |
| `src/lib/spotCatalog.ts` | API からのスポット取得 |
| `src/api.ts` / `src/types.ts` | backend-api クライアントと型 |
| `public/spots/placeholder.svg` | 画像未設定時のプレースホルダー |

---

## 注意 / 未実装範囲

- **会員機能なし**。訪問履歴はブラウザ localStorage のみ。
- **現在地取得（Geolocation）** はブラウザ API + OpenStreetMap Nominatim の逆ジオコーディング（`src/lib/geolocation.ts`）。
- 公開スポットは `isPublicDisplayableRow` の条件を満たすもののみ表示されます（説明・住所・画像が揃っていること）。
