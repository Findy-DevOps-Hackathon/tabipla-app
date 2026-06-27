# @tabipla/user-web

tabipla のユーザー向け Web フロントエンドです。観光スポット（Spot）を検索・閲覧します。

**検索ロジックは持たず**、必ず `services/backend-api`（HTTP）を経由します。Elasticsearch /
`@tabipla/search-core` には直接アクセスしません。

```text
user-web ──(HTTP /api)──▶ backend-api ──▶ search-core ──▶ Elasticsearch
```

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

# backend-api を起動しておく（別ターミナル。Elasticsearch も事前に起動）
pnpm -C services/backend-api dev

# フロント開発起動（http://localhost:5173）
pnpm -C apps/user-web dev
```

開発時は Vite dev server が `/api/*` を backend-api へプロキシするため、CORS 設定なしで
検索 API を呼び出せます（`vite.config.ts`）。

```bash
# 本番相当ビルド / プレビュー
pnpm -C apps/user-web build
pnpm -C apps/user-web preview
```

---

## 画面・機能

スワイプ型のレコメンド体験（モバイルファースト 390×844）。Figma デザイン
（`docs/figma-user-design-brief.md` / Findy DevOps ファイル）に準拠した 5 ステップのフロー。
未ログイン時は会員登録/ログイン画面（`AuthScreen`）を入口に表示する。

0. **会員登録 / ログイン**（`AuthScreen`）— 新規登録（お名前・メール・パスワード）またはログイン
1. **ようこそ**（`WelcomeScreen`）— 挨拶・ログアウト、「現在地を使う」/「目的地を入力する」を選ぶ
2. **目的地入力**（`InputScreen`）— 市区町村・都道府県を入力、サジェスト表示
3. **スワイプ**（`SwipeScreen`）— スポットカードを左右スワイプ（好き / 興味なし）。
   ドラッグ量に応じて LIKE / NOPE オーバーレイを表示し、ボタン操作にも対応
4. **分析中**（`ProcessingScreen`）— スワイプ結果から好みを擬似分析
5. **おすすめ一覧**（`RecommendationsScreen`）— おすすめ理由・相性スコア付きカード

---

## 構成

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | 認証ゲート + フロー全体のステップ状態機械 |
| `src/auth.ts` | 会員登録・ログイン・セッション（localStorage、フロント完結のデモ実装） |
| `src/components/PhoneShell.tsx` | 端末フレーム・ステータスバー・ホームインジケータ |
| `src/components/icons.tsx` | インライン SVG アイコン群 |
| `src/screens/*.tsx` | 各ステップの画面 |
| `src/data/spots.ts` | 小諸市のデモスポット・サジェスト・おすすめデータと型 |
| `src/lib/category.ts` | カテゴリバッジの配色 |
| `src/api.ts` / `src/types.ts` | backend-api 検索クライアントと型（将来のスポット候補取得用に保持） |
| `public/spots/*.png` | カード画像（Figma から取得したデモ写真） |

---

## 注意 / 未実装範囲

- **スワイプ候補・おすすめは現状デモデータ**（`src/data/spots.ts`）。backend-api には
  スワイプ/レコメンド用エンドポイントが未実装のため、将来 `src/api.ts` 経由で
  目的地に応じたスポット候補を取得して差し替える想定。
- **現在地取得（Geolocation）** はブラウザの Geolocation API で実取得し、OpenStreetMap
  Nominatim の逆ジオコーディングでエリア名（市区町村など）へ変換する（`src/lib/geolocation.ts`）。
  許可拒否・取得失敗時は `WelcomeScreen` にエラーを表示する。
- **会員登録/ログインはフロント完結のデモ**（`src/auth.ts`）。アカウント・パスワードは
  localStorage にのみ保存され、サーバーには送らない。backend-api は現状 admin（自治体職員）
  専用の認証のみ持つため、本実装は将来 user 向け会員 API に差し替える想定。
