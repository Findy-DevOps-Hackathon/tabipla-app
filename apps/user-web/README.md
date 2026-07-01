# @tabipla/user-web

tabipla のユーザー向け Web フロントエンドです。スワイプ型のレコメンド体験と AI エージェント連携を提供します。

**検索ロジックは持たず**、Elasticsearch / `@tabipla/search-core` には直接アクセスしません。
エージェント API は開発時に `backend-api` 経由でプロキシされます。

```text
user-web ──(HTTP /api/v1/*)──▶ backend-api ──▶ services/agent
         ──(将来) /api/search* ──▶ backend-api ──▶ search-core ──▶ Elasticsearch
```

会員登録・ログイン機能は提供しません（`@tabipla/db` も利用しません）。

---

## 技術スタック / 依存追加の理由

- TypeScript / Node.js 22+
- [React 19](https://react.dev/) + [Vite 6](https://vite.dev/): 軽量・高速な SPA 開発のため
- [Tailwind CSS v4](https://tailwindcss.com/)（`@tailwindcss/vite`）: 設定ファイル不要で素早くモダンな UI を組むため

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:3001` | 開発サーバが `/api` をプロキシする backend-api の接続先 |

---

## セットアップ・起動

```bash
# リポジトリルートで依存インストール
pnpm install

# backend-api + agent を起動しておく（別ターミナル）
pnpm -C services/backend-api dev
pnpm -C services/agent dev

# フロント開発起動（http://localhost:5173）
pnpm -C apps/user-web dev
```

開発時は Vite dev server が `/api/*` を backend-api へプロキシするため、CORS 設定なしで
エージェント API を呼び出せます（`vite.config.ts`）。

```bash
# 本番相当ビルド / プレビュー
pnpm -C apps/user-web build
pnpm -C apps/user-web preview
```

---

## デプロイ（Firebase Hosting / GCP）

静的 SPA を **Firebase Hosting**（GCP）で配信します。設定は `apps/user-web/firebase.json`
（`public: dist`／SPA 用 `rewrites`／静的アセットのキャッシュ）に定義済みです。

### 前提

- `firebase-tools` は `devDependency` として導入済み（`pnpm exec firebase` で実行可能）。
- Google アカウントと Firebase プロジェクトが必要。

### 手順

```bash
cd apps/user-web

# 1. Google アカウントでログイン（ブラウザが開く対話コマンド）
pnpm exec firebase login

# 2. デプロイ先プロジェクトを指定（どちらか）
#    既存プロジェクトを選ぶ:
pnpm exec firebase use --add
#    新規作成する（プロジェクト ID は世界で一意）:
pnpm exec firebase projects:create <your-project-id>
pnpm exec firebase use <your-project-id>

# 3. ビルド + デプロイ（`pnpm build` も自動実行される）
pnpm run deploy
```

成功すると `Hosting URL: https://<project-id>.web.app` が表示され、そこで公開されます。

> `pnpm run deploy` は `package.json` の `deploy`（= `pnpm build && firebase deploy --only hosting`）です。
> `run` を省いた `pnpm deploy` は pnpm の組み込みコマンドと衝突するため、必ず `pnpm run deploy` を使う。

---

## デプロイ時の注意事項

- **エージェント API（`/api/v1/*`）は本番では未接続**。`/api` のプロキシは開発サーバ（`vite.config.ts`）
  限定のため、Firebase Hosting 単体では `backend-api` / `agent` に到達できず**プラン生成・AI チャットは動きません**。
  画面遷移・スワイプ等のデモ動作は問題なく確認できます。
- **本番でエージェントを繋ぐ場合**は、`backend-api` と `agent` を別 URL（例: Cloud Run）へデプロイし、
  `firebase.json` の `rewrites` に `/api/**` → そのバックエンドへの転送（`run` 連携 or リバースプロキシ）
  を追加する。`src/api.ts` の `API_BASE` 切り替えでも対応可能。
- **`dist/` はビルド成果物**なのでコミット不要（`pnpm deploy` が毎回再生成）。
- **インフラ管理（Terraform 等）は不要**。フロント静的配信のみで状態管理対象がほぼないため、
  `firebase deploy` で完結する。backend 一式を GCP に本格構築する段階で IaC を検討する。

---

## 画面・機能

スワイプ型のレコメンド体験（モバイルファースト 390×844）。Figma デザイン
（`docs/figma-user-design-brief.md` / Findy DevOps ファイル）に準拠したフロー。

1. **ようこそ**（`WelcomeScreen`）— 挨拶、「好み診断を始める」
2. **スワイプ**（`SwipeScreen`）— スポットカードを左右スワイプ（好き / 興味なし）
3. **目的地入力**（`InputScreen`）— 市区町村・都道府県を入力、サジェスト表示
4. **旅の記憶**（`MemoryScreen`）— 過去の旅行体験を自由記述
5. **分析中**（`ProcessingScreen`）— エージェント API でプラン生成
6. **おすすめ一覧**（`RecommendationsScreen`）— おすすめ理由・相性スコア付きカード

---

## 構成

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | フロー全体のステップ状態機械 |
| `src/components/PhoneShell.tsx` | 端末フレーム・ステータスバー・ホームインジケータ |
| `src/components/icons.tsx` | インライン SVG アイコン群 |
| `src/screens/*.tsx` | 各ステップの画面 |
| `src/data/spots.ts` | 小諸市のデモスポット・おすすめデータと型 |
| `src/lib/visited.ts` | 「行った」履歴（localStorage、匿名 `guest`） |
| `src/api.ts` / `src/types.ts` | backend-api 検索クライアントと型（将来の検索 UI 用に保持） |
| `public/spots/*.png` | カード画像（Figma から取得したデモ写真） |

---

## 注意 / 未実装範囲

- **スワイプ候補・おすすめは現状デモデータ**（`src/data/spots.ts`）。プラン生成は
  `backend-api` → `agent` 経由。将来は DB / 検索 API から候補を取得して差し替える想定。
- **現在地取得（Geolocation）** はブラウザの Geolocation API で実取得し、OpenStreetMap
  Nominatim の逆ジオコーディングでエリア名（市区町村など）へ変換する（`src/lib/geolocation.ts`）。
- **会員機能なし**。訪問履歴はブラウザ localStorage のみ（ユーザー ID は常に `guest`）。
