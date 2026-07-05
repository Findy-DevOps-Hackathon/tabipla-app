# Cloud SQL（PostgreSQL）セットアップ

`packages/db` の正本データ用 PostgreSQL を **Cloud SQL** 上に用意し、
`backend-api`（Cloud Run）から Unix ソケット経由で接続します。

```text
Cloud Run (backend-api, asia-northeast1) ──/cloudsql/...──▶ Cloud SQL (PostgreSQL 16, 東京)
ローカル開発 ── Cloud SQL Auth Proxy :5434 ──▶ Cloud SQL
```

---

## 前提

- GCP プロジェクトに **課金が有効**（例: `tabipla-user-web`）
- `gcloud auth login` 済み
- Cloud Run デプロイ済み、またはこれから行う

---

## 1. インスタンス作成（新規・東京）

```bash
gcloud config set project tabipla-user-web
bash infra/cloud-sql/setup.sh
```

作成内容:

| 項目 | 既定値 |
|---|---|
| インスタンス名 | `tabipla-db` |
| DB バージョン | PostgreSQL 16 |
| ティア | `db-f1-micro`（最小構成） |
| リージョン | **`asia-northeast1`（東京）** |
| データベース | `tabipla` |
| ユーザー | `tabipla` |

接続情報は `infra/cloud-sql/.credentials` に保存されます（**コミットしない**）。

Cloud Run の実行 SA に `roles/cloudsql.client` も付与されます。

---

## 2. us-central1 から東京へ移行（既存環境）

旧 `tabipla-db`（us-central1）がある場合:

```bash
brew install cloud-sql-proxy libpq   # pg_dump / pg_restore 用
bash infra/cloud-sql/migrate-to-tokyo.sh
```

移行先インスタンス名は既定 **`tabipla-db-tokyo`**（旧 DB と共存）。  
完了後:

```bash
pnpm --filter @tabipla/backend-api run deploy
pnpm --filter @tabipla/agent run deploy
cd apps/user-web && pnpm run deploy
```

動作確認後、旧インスタンスを削除:

```bash
gcloud sql instances delete tabipla-db --project=tabipla-user-web
```

---

## 3. マイグレーション（スキーマ）

Cloud SQL Auth Proxy が必要です。

```bash
brew install cloud-sql-proxy   # 未インストールの場合
bash infra/cloud-sql/migrate.sh
```

---

## 4. backend-api の .env 更新

`setup.sh` 出力の **Cloud Run 用 DATABASE_URL** を `services/backend-api/.env` に設定:

```bash
# Cloud Run 用（Unix ソケット・東京）
DATABASE_URL=postgresql://tabipla:PASSWORD@/tabipla?host=/cloudsql/tabipla-user-web:asia-northeast1:tabipla-db
CLOUD_SQL_INSTANCE=tabipla-user-web:asia-northeast1:tabipla-db
```

---

## 5. backend-api / agent デプロイ（東京 Cloud Run）

```bash
pnpm --filter @tabipla/backend-api run deploy
pnpm --filter @tabipla/agent run deploy
```

`CLOUD_SQL_INSTANCE` が `.credentials` にあれば、Cloud Run へ `--add-cloudsql-instances` が自動付与されます。  
`firebase.json` の `run.region` は **`asia-northeast1`** です。

---

## ローカルから DB を触る

別ターミナルで:

```bash
bash infra/cloud-sql/connect-proxy.sh
# 表示される DATABASE_URL_LOCAL を export して psql / seed / reindex
```

```bash
export DATABASE_URL='postgresql://tabipla:...@127.0.0.1:5434/tabipla'
pnpm -C packages/db seed
pnpm -C services/backend-api reindex
```

または:

```bash
bash infra/cloud-sql/seed.sh
```

---

## 環境変数（setup.sh 上書き）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | gcloud config | GCP プロジェクト |
| `GOOGLE_CLOUD_LOCATION` | **`asia-northeast1`** | リージョン |
| `CLOUD_SQL_INSTANCE_NAME` | `tabipla-db` | インスタンス名 |
| `CLOUD_SQL_DB_NAME` | `tabipla` | データベース名 |
| `CLOUD_SQL_DB_USER` | `tabipla` | DB ユーザー |
| `CLOUD_SQL_DB_PASSWORD` | 自動生成 | パスワード（再実行時は更新） |

---

## コスト目安

`db-f1-micro` は小規模デモ向けの最小ティアです。停止できないため、**使わない期間はインスタンス削除**を検討してください。

```bash
gcloud sql instances delete tabipla-db --project=tabipla-user-web
```
