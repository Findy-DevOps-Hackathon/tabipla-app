# @tabipla/db

アプリのマスターデータ用 **DB 層**です。**Drizzle ORM + PostgreSQL** を採用し、
観光スポット（`spots`）の正本データを管理します。

検索ロジック（Elasticsearch）は持ちません。Elasticsearch へは `services/backend-api`
の **reindex** が `@tabipla/search-core` 経由でデータを反映します（DB → ES の一方向同期）。

```text
PostgreSQL (正本)  ──reindex──▶  Elasticsearch (検索用の写し)
   @tabipla/db                     @tabipla/search-core
```

---

## 技術スタック / 依存追加の理由

- TypeScript / Node.js 22+
- [Drizzle ORM](https://orm.drizzle.team/)（`drizzle-orm`）: 型安全なクエリと軽量なスキーマ定義のため
- [drizzle-kit](https://orm.drizzle.team/kit-docs/overview)（dev）: スキーマからのマイグレーション生成・適用のため
- [node-postgres](https://node-postgres.com/)（`pg` / `@types/pg`）: PostgreSQL ドライバ
- `tsx`（dev）: seed スクリプトの実行用

---

## 環境変数

| 変数名 | 必須 | 既定値 | 説明 |
|---|---|---|---|
| `DATABASE_URL` | yes | （なし） | PostgreSQL 接続文字列。例: `postgresql://tabipla:tabipla@localhost:5432/tabipla` |

> 認証情報は **コードにハードコードせず**、必ず環境変数から渡してください（`.env` はコミットしない）。
> ローカル用の既定値は `.env.example` を参照してください。

---

## ドメインモデル（spots テーブル）

`@tabipla/search-core` の `SpotDocument` に対応します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | text (PK) | yes | 一意なID（未指定時は UUID 採番。ES の _id と一致させる） |
| `name` | text | yes | スポット名 |
| `description` | text | yes | 説明・本文 |
| `category` | text | no | カテゴリ |
| `area` | text | no | エリア・地域名 |
| `prefecture` | text | no | 都道府県 |
| `address` | text | no | 住所 |
| `tags` | text[] | no | タグ |
| `lat` / `lon` | double precision | no | 緯度経度（reindex 時に `{ lat, lon }` へ組み立て） |
| `created_at` / `updated_at` | timestamptz | yes | 作成・更新日時（既定 now()） |

> `embedding`（ベクトル）は本テーブルでは保持しません。ベクトルは Elasticsearch 側で管理し、
> 生成・投入は RAG パイプライン側（別タスク）で行います。

---

## セットアップ

```bash
# リポジトリルートで依存インストール
pnpm install

# PostgreSQL を起動（infra/docker）
cd infra/docker && docker compose up -d postgres && cd -

# 接続情報を設定（ローカル既定値）
export DATABASE_URL=postgresql://tabipla:tabipla@localhost:5432/tabipla
```

---

## マイグレーション

```bash
# schema.ts からマイグレーション SQL を生成（drizzle/ に出力）
pnpm -C packages/db db:generate

# 生成済みマイグレーションを DB へ適用
pnpm -C packages/db db:migrate

# （開発時の簡易反映）schema を直接 DB へ push する場合
pnpm -C packages/db db:push
```

---

## シードデータ投入

`packages/db/seed-data/` に、ローカル DB から書き出した小諸市スポット 24 件と画像が入っています。

```bash
pnpm -C packages/db seed
```

自治体・管理ユーザー・スポット・クーポン・蘊蓄を冪等に upsert し、`seed-data/images/` の画像を `services/backend-api/data/uploads/spots/` へコピーします。

管理画面ログイン（パスワードは `ADMIN_SEED_PASSWORD`、未設定時 `test-admin-password`）:

- `seed-data/admin-users.json` の email を参照

### ローカル DB から seed-data を更新する

管理画面などでデータを追加・更新したあと、次で `seed-data/` を再生成できます。

```bash
# 接続先は DATABASE_URL（ローカル PostgreSQL の実ポートに合わせる）
DATABASE_URL=postgresql://tabipla:tabipla@localhost:5432/tabipla pnpm -C packages/db seed:export
pnpm -C packages/db seed
```

`seed:export` は DB の全スポット・自治体・管理ユーザー（メールのみ）・クーポン・蘊蓄と、スポット画像ファイルを `seed-data/` へ書き出します。

---

## Elasticsearch への反映（reindex）

DB に投入したデータを検索可能にするには、`backend-api` の reindex を実行します。

```bash
# Elasticsearch も起動してから
pnpm -C services/backend-api reindex
```

詳細は `services/backend-api/README.md` を参照してください。

---

## 公開 API

```ts
import {
  createDatabase,
  upsertSpot,
  upsertSpots,
  getSpotById,
  deleteSpot,
  countSpots,
  iterateAllSpots,
} from "@tabipla/db";

const db = createDatabase(); // DATABASE_URL から接続

await upsertSpot(db, {
  id: "spot-1",
  name: "清水寺",
  description: "京都の有名な寺院",
  prefecture: "京都府",
  tags: ["寺"],
  lat: 34.9948,
  lon: 135.785,
});

// バッチで全件処理（reindex 等）
for await (const batch of iterateAllSpots(db, 500)) {
  // batch: SpotRow[]
}

await db.$client.end(); // スクリプト終了時に接続をクローズ
```

---

## 注意 / 未実装範囲

- **認証・認可** は本パッケージの責務外です（API 層で実施）。
- **Embedding 生成 / RAG パイプライン** は対象外です（別タスク）。
- `infra/docker` の PostgreSQL は **ローカル開発専用** です。本番用の認証・TLS・冗長化は含みません。
