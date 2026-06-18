# 旅サキ バックエンド設計書

> 対象：バックエンド（API・AIエージェント・データ基盤）。フロントエンドで必要な機能を想定し、必要なAPIを設計する。
> 関連：[PRD.md](./PRD.md)

---

## 0. 改訂履歴

| 版 | 日付 | 内容 |
|----|------|------|
| v0.1 | 2026-06-15 | 壁打ちによる初版。GCP / ADK(TS) / ES + Cloud SQL 構成で確定 |

---

## 1. 設計方針

- **AIエージェント中心**：シーンB（現地即時提案）と蘊蓄生成をADKエージェントが担う。
- **スタック一本化**：ADKに公式TypeScriptサポート（`@google/adk`）があるため、APIもエージェントもTypeScriptで実装し、Python別サービスを持たない。
- **ステートレス・アカウントレス**：ユーザーアカウントを持たない。好み・お気に入りは**クライアントのローカル保存**とし、推薦時はリクエストで好みを受け取る。サーバーはユーザー個人情報を永続化しない。
- **1ヶ月で作り切る**：マネージドサービス中心（Cloud Run / Cloud SQL / Elastic Cloud）。MoSCoWに沿ってMustから実装。
- **モック→ネイティブ移行**：フロントはモック段階Web、最終React Native。**APIはどちらからも同一**で使えるよう、プレーンなREST/JSONに統一。

---

## 2. 技術スタック（確定）

| レイヤ | 採用 | 備考 |
|--------|------|------|
| クラウド | **GCP** | |
| 実行基盤 | **Cloud Run**（TypeScript / Node.js 24.13+） | スケール0可・コンテナ |
| AIエージェント | **ADK for TypeScript（`@google/adk`）** | `LlmAgent` + `FunctionTool`(Zod) |
| LLM | **Gemini（Vertex AI 経由）** | 推薦＝Gemini Flash、蘊蓄＝Flash/Pro |
| 埋め込み | **Gemini Embeddings** | スポット・好みのベクトル化 |
| ベクター/地理検索 | **ElasticSearch（Elastic Cloud on GCP）** | `dense_vector`(kNN) + `geo_point` |
| 構造化マスタ | **Cloud SQL (PostgreSQL)** | スポット・自治体・クーポンの正(master) |
| 経路・移動時間 | **Google Maps Routes API** | 徒歩/車/公共交通の実所要時間 |
| 画像 | **Cloud Storage (GCS)** | スポット画像 |
| 秘匿情報 | **Secret Manager** | APIキー・ES資格情報 |
| CI/CD | **Cloud Build + Artifact Registry** | |
| API様式 | **REST + JSON（同期）** | ストリーミングは将来 |

---

## 3. システム構成（コンポーネント）

```
[ React Native アプリ / Web モック ]   [ 管理Web（最小・自治体） ]
                |                                   |
                |  REST/JSON (HTTPS)                | REST/JSON (+ x-api-key)
                v                                   v
        +-------------------------------------------------------+
        |            Cloud Run : tabisaki-backend (TS)          |
        |  - API層 (Hono/Fastify)                               |
        |  - 推薦/蘊蓄: ADK LlmAgent + FunctionTools            |
        |  - 取り込み(Ingestion): 埋め込み生成 → ES索引 + SQL書込 |
        +-------------------------------------------------------+
            |            |              |               |
            v            v              v               v
      Cloud SQL    ElasticSearch   Vertex AI       Google Maps
      (Postgres)   (vector+geo)    (Gemini)        Routes API
                                       ^
                                       |
                                  GCS (画像) / Secret Manager
```

> 1ヶ月制約のため**単一Cloud Runサービス**に集約。内部はモジュール分割（API / Agent / Ingestion）し、必要になればサービス分離可能な構造にする。

---

## 4. データモデル（マスタ：Cloud SQL）

> 正規化の正はCloud SQL。検索用の非正規化コピーをESに索引する。

### 4.1 主なテーブル

**municipalities（自治体）**
| カラム | 型 | 備考 |
|--------|----|----|
| id | uuid (PK) | |
| name | text | 例：小諸市 |
| api_key_hash | text | 管理API認証用 |
| created_at | timestamptz | |

**spots（観光スポット）**
| カラム | 型 | 備考 |
|--------|----|----|
| id | uuid (PK) | |
| municipality_id | uuid (FK) | |
| name | text | |
| category | text | 酒蔵/神社/カフェ/自然/遺産 等 |
| lat / lng | double | |
| address | text | |
| price_yen | int | 入場/体験料の目安 |
| estimated_stay_minutes | int | 標準滞在時間 |
| description | text | |
| tags | text[] | 好みマッチ用 |
| image_urls | text[] | GCS URL |
| status | text | draft/published（自治体が直接公開） |
| created_at / updated_at | timestamptz | |

**unchiku_facts（蘊蓄ネタ＝素材）**
| カラム | 型 | 備考 |
|--------|----|----|
| id | uuid (PK) | |
| spot_id | uuid (FK) | |
| label | text | 見出し（例：ワインの歴史） |
| text | text | **事実ベースの素材。AIが語り口を生成する元ネタ** |
| source | text | 出典（任意） |

**coupons（クーポン・特典）**
| カラム | 型 | 備考 |
|--------|----|----|
| id | uuid (PK) | |
| spot_id | uuid (FK) | |
| title / description | text | |
| discount | text | 例：10%OFF / 1ドリンク無料 |
| conditions | text | |
| valid_until | date | |

### 4.2 ElasticSearch インデックス：`spots`
```jsonc
{
  "mappings": {
    "properties": {
      "spot_id":       { "type": "keyword" },
      "name":          { "type": "text" },
      "category":      { "type": "keyword" },
      "tags":          { "type": "keyword" },
      "location":      { "type": "geo_point" },     // 距離・到達圏フィルタ
      "price_yen":     { "type": "integer" },
      "stay_minutes":  { "type": "integer" },
      "status":        { "type": "keyword" },
      "semantic_text": { "type": "text" },          // description + 蘊蓄 + tags
      "embedding":     { "type": "dense_vector", "dims": 768, "index": true, "similarity": "cosine" }
    }
  }
}
```
- `embedding` … スポットの意味表現（説明＋蘊蓄＋タグ）をGemini Embeddingsでベクトル化。
- 検索は **kNN（好みベクトル）× geo_distance（到達圏）× price/category フィルタ** の複合。

---

## 5. AIエージェント設計（ADK for TypeScript）

### 5.1 推薦エージェント `tabisaki-concierge`
- `LlmAgent`（model: Gemini Flash）。**Function Tools** を自律的に呼び出して候補を探索・絞り込み、理由文を生成して**構造化JSONで出力**（ADKの output schema）。

**FunctionTools（Zodスキーマ）**

| ツール | 入力 | 処理 | 出力 |
|--------|------|------|------|
| `searchCandidateSpots` | 好みベクトル/タグ, 現在地, 到達圏半径, 予算, 除外ID, limit | ES kNN + geo_distance + price/category フィルタ | 候補スポット配列 |
| `getTravelTimes` | 現在地, 候補座標[], 移動手段 | Google Maps Routes（matrix）で実所要時間 | 手段別の所要分・距離 |
| `getUnchikuSource` | spotId | Cloud SQL から蘊蓄ネタ取得 | facts[] |

**推論フロー（シーンB）**
1. 好み（tags＋freeText）を埋め込み → 到達圏半径を「残り時間×手段速度」で概算。
2. `searchCandidateSpots` で意味＋地理＋価格の候補抽出。
3. `getTravelTimes` で実所要時間を取得し、残り時間に収まる候補へ絞り込み。
4. LLMが各スポットの「**なぜあなたに合うか**」を生成・ランキング。
5. 構造化JSONで返却。

### 5.2 蘊蓄エージェント `tabisaki-storyteller`
- 入力：spotの蘊蓄ネタ（`unchiku_facts`）＋ユーザーの好み。
- 役割：**ネタをゼロ生成せず**、事実素材をユーザー向けにパーソナライズし語り口を生成。誇張・創作を抑制するシステムプロンプト（「与えられたfacts外の事実を作らない」）。
- 出力：story（語り）＋ sourceFacts（根拠）＋ talkingPoints（人に話せる小ネタ）。

### 5.3 自律計画エージェント（Should）
- 上記ツールに加え、複数スポットを到達時間でつなぎ時間軸付き旅程を生成。MVPはMust成立後に拡張。

---

## 6. API設計

- ベースURL：`/v1`、`Content-Type: application/json`
- toC：**認証なし（匿名）**。好みは毎リクエストで受領。
- 管理：`x-api-key` ヘッダ（自治体ごと）。
- エラー：`{ "error": { "code": string, "message": string } }`、HTTPステータス準拠。

### 6.1 toC API（旅サキ アプリ）

#### `GET /v1/meta/preference-tags` — オンボーディング用タグ一覧
推薦のシードとなる好みタグを返す（クライアントは選択結果をローカル保存）。
```jsonc
// 200
{ "tags": [
  { "id": "sakagura", "label": "酒蔵" },
  { "id": "jinja",    "label": "神社" },
  { "id": "cafe",     "label": "カフェ" }
] }
```

#### `POST /v1/recommendations` — 現地即時提案【Must / シーンBの主役】
エージェントを起動し、条件に合うニッチ観光地と「合う理由」を返す。
```jsonc
// Request
{
  "location": { "lat": 36.328, "lng": 138.428 },
  "availableMinutes": 180,
  "budgetYen": 3000,                       // 任意（上限）
  "transportMode": "car",                  // "walk" | "car" | "transit"
  "preferences": { "tags": ["sakagura","shizen"], "freeText": "静かな所が好き" },
  "excludeSpotIds": ["..."],               // 任意（既出除外）
  "limit": 5
}
// 200
{
  "recommendations": [
    {
      "spot": {
        "id": "...", "name": "...", "category": "sakagura",
        "location": { "lat": 0, "lng": 0 }, "address": "...",
        "priceYen": 800, "estimatedStayMinutes": 60,
        "thumbnailUrl": "https://...", "tags": ["sakagura"]
      },
      "travel": { "mode": "car", "travelMinutes": 22, "distanceMeters": 9200 },
      "fitsInTime": true,
      "reason": "酒蔵巡りがお好みで、静かに試飲できる小規模蔵です。往復＋滞在で約100分、残り時間に収まります。",
      "matchScore": 0.86
    }
  ],
  "agentMessage": "車で30分圏に、観光地化していない酒蔵が見つかりました。"
}
```

#### `POST /v1/spots/{spotId}/story` — 蘊蓄生成【Must】
蘊蓄ネタをユーザー向けにパーソナライズして語る。
```jsonc
// Request
{ "preferences": { "tags": ["sakagura"], "freeText": "" }, "tone": "casual" }
// 200
{
  "spotId": "...",
  "story": "実はこの蔵、明治期に……（パーソナライズされた語り）",
  "sourceFacts": [ { "label": "創業", "text": "1897年創業" } ],
  "talkingPoints": ["仕込み水が浅間山の伏流水", "限定酒は蔵元のみ販売"]
}
```

#### `GET /v1/spots/{spotId}` — スポット詳細
```jsonc
// 200
{ "spot": { /* spot object */ }, "coupons": [ /* coupon[] */ ] }
```

#### `GET /v1/spots/{spotId}/coupons` — クーポン取得【Should】
```jsonc
// 200
{ "coupons": [
  { "id":"...", "title":"試飲1杯無料", "description":"...", "discount":"1杯無料",
    "conditions":"アプリ提示", "validUntil":"2026-12-31" }
] }
```
> 利用（redeem）はMVPでは提示のみ（クライアント側で消し込み）。将来サーバー消し込みに拡張。

#### `POST /v1/itineraries/plan` — 旅程一括提案【Should / 自律計画型】
```jsonc
// Request（recommendations と同入力 + 開始時刻）
{ "location": {...}, "availableMinutes": 240, "transportMode": "car",
  "preferences": {...}, "startTime": "2026-06-15T13:00:00+09:00" }
// 200
{
  "itinerary": [
    { "spot": {...}, "arriveAt": "13:25", "leaveAt": "14:25",
      "travelFromPrev": { "mode":"car", "minutes":25 } }
  ],
  "totalMinutes": 220,
  "summary": "酒蔵→蕎麦→眺望スポットの半日コースです。"
}
```

### 6.2 管理 API（旅サキ管理・最小）

#### `POST /v1/admin/spots` — スポット＋蘊蓄ネタ＋クーポンの注入
`x-api-key` 必須。書込時に**埋め込み生成→ES索引→Cloud SQL書込**を実行。
```jsonc
// Request
{
  "name": "○○酒造", "category": "sakagura",
  "location": { "lat": 0, "lng": 0 }, "address": "長野県小諸市...",
  "priceYen": 800, "estimatedStayMinutes": 60,
  "description": "...", "tags": ["sakagura","shizen"],
  "imageUrls": ["gs://..."],
  "unchikuFacts": [ { "label":"創業", "text":"1897年創業", "source":"市史" } ],
  "coupons": [ { "title":"試飲1杯無料", "discount":"1杯無料", "validUntil":"2026-12-31" } ],
  "status": "published"
}
// 201
{ "id": "...", "indexed": true }
```

#### その他管理
| メソッド | パス | 用途 |
|---------|------|------|
| `PUT` | `/v1/admin/spots/{id}` | 更新（再埋め込み・再索引） |
| `DELETE` | `/v1/admin/spots/{id}` | 削除（ES/SQLから除去） |
| `POST` | `/v1/admin/spots:bulk` | シード一括投入（デモ用） |
| `GET` | `/v1/admin/spots` | 自治体の掲載一覧 |

### 6.3 システム
| メソッド | パス | 用途 |
|---------|------|------|
| `GET` | `/healthz` | ヘルスチェック（Cloud Run） |

### 6.4 フロントエンド機能 → API 対応表
| フロント機能 | 利用API |
|--------------|---------|
| オンボーディング好み入力（ローカル保存） | `GET /v1/meta/preference-tags` |
| シーンB：現地即時提案 | `POST /v1/recommendations` |
| スポット詳細・蘊蓄表示 | `GET /v1/spots/{id}` ＋ `POST /v1/spots/{id}/story` |
| クーポン表示 | `GET /v1/spots/{id}/coupons` |
| 旅程一括提案（Should） | `POST /v1/itineraries/plan` |
| お気に入り保存 | **APIなし（ローカル保存）** |
| 自治体：データ注入 | `POST/PUT/DELETE /v1/admin/spots` |

---

## 7. 主要シーケンス（シーンB：現地即時提案）

1. アプリ → `POST /v1/recommendations`（現在地・残り時間・予算・手段・好み）
2. API層 → 好みを Gemini Embeddings でベクトル化
3. ADKエージェント起動
   - `searchCandidateSpots`：ES へ kNN＋geo_distance＋価格/カテゴリ フィルタ
   - `getTravelTimes`：Maps Routes で手段別の実所要時間
   - 残り時間に収まる候補へ絞り込み
4. LLM が理由生成＋ランキング → 構造化JSON
5. API層 → クライアントへJSON返却

---

## 8. 非機能・運用

- **デプロイ**：Cloud Build → Artifact Registry → Cloud Run。リビジョン切替で無停止。
- **スケール**：Cloud Run autoscaling（min 0 / max 適宜）。デモはmin 1でコールドスタート回避。
- **秘匿情報**：Maps APIキー・ES資格情報・Vertex認証は Secret Manager。
- **レート/コスト**：Maps Routes は候補上位N件のみ呼ぶ（matrix最小化）。Gemini呼び出しは推薦1回/蘊蓄1回に限定。
- **キャッシュ**：蘊蓄(`story`)は (spotId × 好みハッシュ) でキャッシュ可能（将来）。
- **可観測性**：Cloud Logging / Cloud Trace。エージェントのツール呼び出しをログ化。
- **CORS**：Webモック用に許可。React Native はネイティブのため不要。

---

## 9. 未確定・要検討事項

| # | 項目 | メモ |
|---|------|------|
| 1 | 埋め込みモデル次元数 | `dims` はGemini Embeddingsの採用モデルに合わせて確定（暫定768） |
| 2 | 蘊蓄の事実性ガード | facts外生成の抑制プロンプト＋出典表示。評価方法は要検討 |
| 3 | 公共交通の所要時間精度 | Maps transit のデモ地域での精度を確認 |
| 4 | ES vs Cloud SQL の責務境界 | 検索=ES / 正=SQL。整合（再索引）の運用を簡素化 |
| 5 | 管理API認証 | MVPは自治体ごとの固定APIキー。将来は本認証へ |
| 6 | Webモック→RN移行時のAPI差分 | 位置情報取得・画像表示以外はAPI共通の想定 |
