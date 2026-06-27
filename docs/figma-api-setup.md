# Figma API セットアップ（管理画面 UI 実装用）

管理画面 (`apps/admin-web`) を Figma デザインに沿って実装するため、Figma からデザイン情報を取得する手順です。

**対象ファイル**

| 項目 | 値 |
|------|-----|
| ファイル名 | Findy-DevOps |
| fileKey | `C3SvlA4YQFNyhz0yvqqcRx` |
| 開始ノード | `59:9`（プロトタイプ `node-id=59-9`） |
| プロトタイプ | https://www.figma.com/proto/C3SvlA4YQFNyhz0yvqqcRx/Findy-DevOps?node-id=59-9 |

---

## 方法 A: Figma MCP（Cursor 推奨）

Cursor に **Figma プラグイン** を有効にすると、チャットから直接デザインを参照できます。

1. Cursor → Settings → MCP で **Figma** サーバーが有効か確認
2. 無効なら Figma プラグインをインストール / 有効化して Cursor を再起動
3. Figma デスクトップ or ブラウザで対象ファイルを開いた状態にする
4. チャットで「Figma の管理画面デザインを参照して admin-web を実装」と依頼

利用可能になる MCP ツール例:

- `get_metadata` — ノード構造
- `get_screenshot` — 画面キャプチャ
- `get_design_context` — 実装向けコンテキスト
- `use_figma` — Plugin API 経由の詳細取得

> MCP が `MCP server does not exist: figma` となる場合、プラグイン未接続です。

---

## 方法 B: Figma REST API（トークン方式）

### 1. Personal Access Token を発行

1. [Figma Settings → Security](https://www.figma.com/settings) を開く
2. **Personal access tokens** → Generate new token
3. スコープ: `File content`（Read）が必要

### 2. 環境変数を設定

```bash
export FIGMA_ACCESS_TOKEN=figd_xxxxxxxx
# 任意
export FIGMA_FILE_KEY=C3SvlA4YQFNyhz0yvqqcRx
export FIGMA_NODE_IDS=59:9
```

リポジトリルートに `.env.local` を置く場合（**コミットしない**）:

```bash
FIGMA_ACCESS_TOKEN=figd_xxxxxxxx
```

### 3. デザイン JSON を取得

```bash
node scripts/figma/fetch-design.mjs
```

出力: `docs/figma-export/admin-design.json`

- 全ページのフレーム一覧（画面名・サイズ）
- 指定ノードの色・テキスト・レイアウト情報

### 4. 実装フロー

```
fetch-design.mjs → admin-design.json → apps/admin-web 実装
```

---

## 注意

- **プロトタイプのパスワード**は REST API では不要（ファイルへの API アクセス権があれば取得可）
- トークンを持つアカウントが **Findy-DevOps ファイルの閲覧権限** を持っている必要があります
- エクスポート JSON は `.gitignore` 推奨（トークンは含まないが、デザイン詳細を含む）

---

## 関連

- [figma-admin-design-brief.md](./figma-admin-design-brief.md) — 画面要件（Markdown 版）
- [Figma REST API ドキュメント](https://www.figma.com/developers/api)
