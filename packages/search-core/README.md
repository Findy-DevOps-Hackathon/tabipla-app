# @tabipla/search-core

Elasticsearch を用いた検索ロジックを集約する共通ライブラリです。

検索処理を特定のアプリに依存させず、このパッケージに集約することで、
`backend-api` / `agent-api` など複数の利用者が同じ検索基盤を共有できるようにします。

> **重要:** `apps/*`（管理画面・ユーザー画面）や AI エージェントは Elasticsearch に
> 直接アクセスしません。必ず API 層を経由して本パッケージを利用してください。

---

## 目的

- Elasticsearch クライアント生成を 1 箇所に集約する
- Index / Mapping を管理する
- スポット（`SpotDocument`）の登録・更新・削除を提供する
- キーワード検索 / ベクトル検索 / ハイブリッド検索を提供する
- 検索対象ドメイン型（`SpotDocument` = 観光スポット）を提供する

## ドメインモデル（SpotDocument）

検索対象の中心エンティティは**観光スポット（Spot）**です。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | yes | 一意なID（ES の _id） |
| `name` | string | yes | スポット名（全文検索の主対象） |
| `description` | string | yes | 説明・本文 |
| `category` | string | no | カテゴリ（観光 / グルメ / 自然 / 歴史 等） |
| `area` | string | no | エリア・地域名（例: 京都市） |
| `prefecture` | string | no | 都道府県 |
| `address` | string | no | 住所 |
| `tags` | string[] | no | タグ |
| `location` | `{ lat, lon }` | no | 緯度経度（geo_point） |
| `embedding` | number[] | no | ベクトル（生成は責務外） |
| `createdAt` / `updatedAt` | string | no | ISO 8601 日時 |

---

## 提供する主な機能

| 機能 | 関数 |
|---|---|
| クライアント生成 | `createElasticsearchClient`, `getDefaultClient` |
| 疎通確認 | `pingElasticsearch` |
| Index 作成 | `ensureIndex` |
| 登録 | `indexDocument`, `bulkIndexDocuments` |
| 更新 | `updateDocument` |
| 削除 | `deleteDocument` |
| キーワード検索 | `keywordSearch` |
| ベクトル検索 (kNN) | `vectorSearch` |
| ハイブリッド検索 | `hybridSearch` |

---

## 環境変数

| 変数名 | 必須 | 既定値 | 説明 |
|---|---|---|---|
| `ES_NODE` | no | `http://localhost:9200` | Elasticsearch 接続先 URL |
| `ES_API_KEY` | no | （なし） | APIキー認証を使う場合のキー |
| `ES_USERNAME` | no | （なし） | Basic 認証ユーザー名 |
| `ES_PASSWORD` | no | （なし） | Basic 認証パスワード |
| `ES_INDEX` | no | `spots` | 既定の index 名 |
| `ES_VECTOR_DIMS` | no | `1536` | dense_vector の次元数。利用する埋め込みモデルに合わせる |

> 認証情報は **コードにハードコードせず**、必ず環境変数から渡してください。
> 本番用の認証情報・APIキーをリポジトリにコミットしないこと。

---

## ローカル起動手順（Elasticsearch / Kibana）

ローカル開発用の Docker Compose を用意しています（本番用ではありません）。

```bash
# リポジトリルートから
cd infra/docker
docker compose up -d

# 疎通確認
curl http://localhost:9200            # Elasticsearch
# Kibana: ブラウザで http://localhost:5601 を開く
```

停止:

```bash
docker compose down          # コンテナ停止
docker compose down -v       # データ(volume)も削除
```

---

## パッケージのセットアップ

```bash
cd packages/search-core
pnpm install        # 依存インストール
pnpm typecheck      # 型チェック
pnpm build          # dist/ にビルド
```

---

## 使用例

### 1. 接続確認と Index 作成

```ts
import {
  createElasticsearchClient,
  pingElasticsearch,
  ensureIndex,
} from "@tabipla/search-core";

const client = createElasticsearchClient(); // ES_NODE 等を環境変数から解決

if (!(await pingElasticsearch(client))) {
  throw new Error("Elasticsearch に接続できませんでした");
}

await ensureIndex(client); // 既定 index "spots" を作成（既に存在すれば何もしない）
```

### 2. スポットの登録

```ts
import { indexDocument } from "@tabipla/search-core";

await indexDocument(
  client,
  {
    id: "spot-1",
    name: "清水寺",
    description: "京都を代表する世界遺産の寺院。",
    category: "観光",
    area: "京都市",
    prefecture: "京都府",
    tags: ["寺", "世界遺産"],
    location: { lat: 34.9948, lon: 135.785 },
    createdAt: new Date().toISOString(),
  },
  { refresh: true }, // すぐ検索可能にする（開発・テスト用）
);
```

### 3. キーワード検索

```ts
import { keywordSearch } from "@tabipla/search-core";

const results = await keywordSearch(client, {
  query: "京都",
  filters: { category: "観光" },
  size: 10,
  from: 0,
});

for (const r of results) {
  console.log(r.id, r.score, r.document.name);
}
```

### 4. スポットの更新・削除

```ts
import { updateDocument, deleteDocument } from "@tabipla/search-core";

await updateDocument(client, "spot-1", { name: "清水寺（更新）" }, { refresh: true });
await deleteDocument(client, "spot-1", { refresh: true });
```

---

## ベクトル検索 / ハイブリッド検索の状態

| 機能 | 状態 |
|---|---|
| Mapping (`dense_vector`) | **初期実装済み**（`ES_VECTOR_DIMS` で次元数を管理） |
| `vectorSearch` (kNN) | **初期実装済み**（埋め込みベクトルは呼び出し元が渡す） |
| `hybridSearch` | **初期実装済み**（キーワード + kNN のスコア加算による統合） |
| Embedding 生成 | **未実装（対象外）** — 将来 `agent-api` 等で生成する |
| RAG パイプライン | **未実装（対象外）** |

### ベクトル検索の使い方（埋め込みは外部生成）

```ts
import { vectorSearch } from "@tabipla/search-core";

// embedding は別途生成したクエリベクトル（次元数は ES_VECTOR_DIMS と一致が必要）
const results = await vectorSearch(client, {
  embedding: queryVector,
  k: 10,
});
```

### ハイブリッド検索のスコア統合方法

`hybridSearch` は指定内容によって挙動が変わります。

- `query` のみ → キーワード検索
- `embedding` のみ → ベクトル検索
- 両方 → 1 リクエストで `query`(bool) と `knn` を併用し、
  **キーワードスコア + (kNN スコア × `knnBoost`)** の合計でランキングします。

複雑な再ランキング（RRF など）は初期実装では行っていません。
スコア統合の差し替えは `hybridSearch` を単一の窓口として将来拡張できます。

---

## 注意事項 / 未実装範囲

- 本パッケージは **検索ロジックのみ** を担います。認証・DB アクセス・UI は含みません。
- **Embedding 生成** と **RAG パイプライン** は対象外です（将来対応）。
- `infra/docker` の構成は **ローカル開発専用** です。本番用の認証・TLS・クラスタ設計は含みません。
- `ensureIndex` は index が存在する場合に **mapping の差分適用や再作成を行いません**
  （破壊的変更を避けるため）。mapping を変更する場合は別途マイグレーションを設計してください。
- エラーは握りつぶさず送出します。呼び出し元（API 層）で適切にハンドリングしてください。
