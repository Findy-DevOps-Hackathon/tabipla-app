# Elasticsearch（本番）

PostgreSQL の検索用コピーとして Elasticsearch を使います。ローカルは Docker Compose、本番は **Elastic Cloud**（推奨）を想定しています。

```text
Cloud SQL (PostgreSQL) ──reindex/embed──▶ Elastic Cloud (index: spots)
Cloud Run (backend-api / agent) ──ES_NODE + ES_API_KEY──▶ Elastic Cloud
```

---

## 前提

- GCP プロジェクト（例: `tabipla-user-web`）
- Elastic Cloud デプロイメント（[cloud.elastic.co](https://cloud.elastic.co)）
  - リージョン: **`asia-northeast1`（東京）** 推奨
- `gcloud auth login` 済み

---

## 1. Elastic Cloud デプロイメント作成

1. [Elastic Cloud](https://cloud.elastic.co) でデプロイメントを作成
2. **Elasticsearch endpoint** を控える（例: `https://xxx.es.asia-northeast1.gcp.cloud.es.io:443`）
3. **Security → API keys** で API キーを作成（推奨）

---

## 2. 接続情報の登録

```bash
gcloud config set project tabipla-user-web
bash infra/elasticsearch/setup.sh
```

対話形式で `ES_NODE` と `ES_API_KEY`（または Basic 認証）を入力します。

> **注意**: `services/backend-api/.env` の `ES_NODE=http://localhost:9200` はローカル用のため、本番セットアップでは無視されます。必ず Elastic Cloud の endpoint URL を入力してください。

結果は `infra/elasticsearch/.credentials` に保存され（**コミットしない**）、以下に反映されます。

- Secret Manager（`tabipla-es-api-key` など）
- Cloud Build トリガーの `_ES_NODE` など

---

## 3. Cloud Run へ即時反映

コードデプロイを待たずに環境変数だけ更新する場合:

```bash
bash infra/elasticsearch/apply-cloud-run.sh
```

`tabipla-backend-api` と `tabipla-agent` の両方に `ES_NODE` と認証 Secret を設定します。

---

## 4. 本番データの同期

```bash
bash infra/elasticsearch/sync-production.sh
```

Cloud SQL Auth Proxy 経由で本番 DB から:

1. `reindex`（PG → ES）
2. `embed-spots`（ベクトル埋め込み）

を実行します。

seed 後の流れは `infra/cloud-sql/post-seed.sh` も利用できます（ES 認証情報を自動読み込み）。

---

## 5. 動作確認

```bash
BACKEND_URL="$(gcloud run services describe tabipla-backend-api \
  --project=tabipla-user-web --region=asia-northeast1 --format='value(status.url)')"
curl -s "${BACKEND_URL}/health"
curl -G "${BACKEND_URL}/search" --data-urlencode 'q=能登' --data-urlencode 'size=3'
```

`elasticsearch: true` になれば接続成功です。

---

## 環境変数

| 変数 | 保存先 | 説明 |
|---|---|---|
| `ES_NODE` | Cloud Run env / トリガー substitution | 接続先 URL |
| `ES_API_KEY` | Secret Manager | API キー認証（推奨） |
| `ES_USERNAME` / `ES_PASSWORD` | Secret Manager | Basic 認証（代替） |
| `ES_INDEX` | Cloud Run env | 既定 `spots` |
| `ES_VECTOR_DIMS` | Cloud Run env | 既定 `1536` |

詳細は `packages/search-core/README.md` を参照。
