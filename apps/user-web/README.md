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

- 検索ボックス（入力を 300ms デバウンスし、`GET /api/search?q=` を呼び出し）
- 結果一覧（カテゴリバッジ・エリア・説明・タグ・スコアを表示）
- ローディング / エラー / 0 件 / 初期状態の表示分岐
- 連続入力時は `AbortController` で古いリクエストをキャンセルし、最新結果のみ採用

---

## 構成

| ファイル | 役割 |
|---|---|
| `src/api.ts` | backend-api への検索クライアント（HTTP 境界） |
| `src/types.ts` | API レスポンスの型（search-core の型に対応する最小再定義） |
| `src/App.tsx` | 検索状態管理と画面全体 |
| `src/components/SpotCard.tsx` | スポット 1 件の表示カード |

---

## 注意 / 未実装範囲

- **ベクトル / ハイブリッド検索 UI** は未実装（現状はキーワード検索のみ）。
- **カテゴリ・エリアでの絞り込み UI** は未実装（backend-api の GET `/search` は filters 非対応のため、必要なら API 拡張とあわせて対応）。
- **認証** は未実装（対象外）。
