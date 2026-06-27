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

- **検索 API（`/api/*`）は本番では未接続**。`/api` のプロキシは開発サーバ（`vite.config.ts`）
  限定のため、Firebase Hosting 単体では `backend-api` に到達できず**検索機能は動きません**。
  画面遷移・スワイプ等のデモ動作は問題なく確認できます。
- **本番で実検索を繋ぐ場合**は、`backend-api` を別 URL（例: Cloud Run）へデプロイし、
  `firebase.json` の `rewrites` に `/api/**` → そのバックエンドへの転送（`run` 連携 or リバースプロキシ）
  を追加する。`src/api.ts` の `API_BASE` 切り替えでも対応可能。
- **会員登録/ログインはフロント完結のデモ**（`src/auth.ts`、localStorage 保存）。本番公開時は
  認証情報がサーバーに送られない点に留意（将来 user 向け会員 API へ差し替え予定）。
- **`dist/` はビルド成果物**なのでコミット不要（`pnpm deploy` が毎回再生成）。
- **インフラ管理（Terraform 等）は不要**。フロント静的配信のみで状態管理対象がほぼないため、
  `firebase deploy` で完結する。backend 一式を GCP に本格構築する段階で IaC を検討する。

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
