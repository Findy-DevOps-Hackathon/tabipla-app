# 旅サキ バックエンド タスク分解 ＆ チームアサイン

> 体制：2人 × 2チーム（計4名）。期間：1ヶ月未満。
> 関連：[backend-design.md](./backend-design.md) / [PRD.md](./PRD.md)

---

## 1. 分割の方針

- **縦割り**で分担し、チーム間の結合点を最小化する。
- **Team A＝AI・ディスカバリー**（エージェント＋検索＝シーンBの主役）。
- **Team B＝プラットフォーム・データ**（基盤＋Cloud SQL＋管理/取り込み＋参照API）。
- **Day 0で「契約」を両チーム合意**（共通型・DBスキーマ・ES索引/検索関数・ツールシグネチャ・埋め込み次元）。以降はスタブ/モックで並行作業。

---

## 2. Day 0：共通契約（両チームで先に確定）★最優先

| ID  | 内容                                                                                   | 主担当      |
| --- | -------------------------------------------------------------------------------------- | ----------- |
| S1  | 共通型パッケージ `@tabisaki/contracts`（API I/O型・ドメイン型）                        | A・B合同    |
| S2  | Cloud SQL スキーマ合意（spots / unchiku_facts / coupons / municipalities）             | Team B 起案 |
| S3  | ES index mapping ＋ `indexSpot()/deleteSpot()/searchCandidateSpots()` のシグネチャ合意 | Team A 起案 |
| S4  | FunctionTool シグネチャ合意（search / travelTimes / getUnchikuSource）                 | Team A 起案 |
| S5  | 埋め込みモデル・次元数(dims)確定                                                       | Team A      |

> これが揃うと、A↔Bは**インターフェース越し**に独立して進められる。

---

## 3. Team A：AI・ディスカバリー班（2名）

エージェント・検索・埋め込み・移動時間・推薦/蘊蓄/旅程API を担当。

| ID  | タスク                                                                                                                 | 依存  | 目安週 | MoSCoW |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ------ |
| A1  | Elastic Cloud 構築 ＋ `spots` index mapping 作成                                                                       | S3    | W1     | Must   |
| A2  | 埋め込みモジュール（Gemini Embeddings, dims確定, テキスト整形）                                                        | S5    | W1     | Must   |
| A3  | 検索モジュール `searchCandidateSpots`（kNN×geo_distance×price/category）＋ 索引関数 `indexSpot/deleteSpot`（B4が呼ぶ） | A1,A2 | W1–2   | Must   |
| A4  | Maps Routes ツール `getTravelTimes`（手段別 matrix・上位N件のみ）                                                      | S4    | W2     | Must   |
| A5  | ADK推薦エージェント ＋ `POST /v1/recommendations`（探索→絞込→理由生成）                                                | A3,A4 | W2     | Must   |
| A6  | 蘊蓄エージェント ＋ `POST /v1/spots/{id}/story`（facts外生成の抑制ガード）                                             | A3    | W2–3   | Must   |
| A7  | 旅程エージェント ＋ `POST /v1/itineraries/plan`                                                                        | A5    | W3     | Should |
| A8  | デモ用チューニング（理由文・蘊蓄の品質、レイテンシ最適化）                                                             | A5,A6 | W3–4   | Should |

**チーム内サブ分担（目安）**

- A-1（検索基盤担当）：A1・A2・A3・A4
- A-2（エージェント担当）：A5・A6・A7・A8

---

## 4. Team B：プラットフォーム・データ班（2名）

リポジトリ基盤・Cloud SQL・管理/取り込み・参照API・インフラ を担当。

| ID  | タスク                                                                                            | 依存  | 目安週 | MoSCoW      |
| --- | ------------------------------------------------------------------------------------------------- | ----- | ------ | ----------- |
| B1  | リポジトリ雛形（TS/Node24, Hono）＋ Cloud Run/Build/Artifact Registry/Secret Manager              | —     | W1     | Must        |
| B2  | Cloud SQL スキーマ＆マイグレーション ＋ リポジトリ層（`getSpot`/`getUnchikuSource` 等。A6が利用） | S2    | W1     | Must        |
| B3  | 管理API CRUD（`POST/PUT/DELETE /v1/admin/spots`, `:bulk`, `GET /admin/spots`）＋ `x-api-key` 認証 | B2    | W2     | Must        |
| B4  | 取り込み(Ingestion)：SQL書込 →（A3）`indexSpot` 呼出で埋め込み＋ES索引                            | B2,A3 | W2     | Must        |
| B5  | 参照API：`GET /meta/preference-tags`・`GET /spots/{id}`・`/spots/{id}/coupons`・`/healthz`        | B2    | W2     | Must/Should |
| B6  | GCS 画像アップロード（署名URL or 直アップ）                                                       | B1    | W2     | Should      |
| B7  | 共通：APIエラー規約・CORS・Logging/Trace・**契約モックサーバ**（A/フロントが叩けるstub）          | B1,S1 | W1–2   | Must        |
| B8  | シードデータ投入（小諸市デモデータ）＋ bulk実行                                                   | B3,B4 | W3     | Must        |

**チーム内サブ分担（目安）**

- B-1（基盤/インフラ担当）：B1・B6・B7・デプロイ運用
- B-2（データ/管理API担当）：B2・B3・B4・B5・B8

---

## 5. チーム間の結合点（インターフェース）

| 結合点                                    | 提供側 | 利用側         | 受け渡し                            |
| ----------------------------------------- | ------ | -------------- | ----------------------------------- |
| 索引関数 `indexSpot/deleteSpot`           | A3     | B4(取り込み)   | `@tabisaki/contracts` の型＋関数I/F |
| 検索 `searchCandidateSpots`               | A3     | A5/A6(内部)    | チーム内                            |
| SQL リポジトリ `getSpot/getUnchikuSource` | B2     | A6(蘊蓄ツール) | リポジトリ関数I/F                   |
| API I/O 型                                | S1合同 | A・B・フロント | 共通型パッケージ                    |
| モックサーバ                              | B7     | A・フロント    | 契約スタブ（実装前から疎通）        |

> 依存があっても、**型＋スタブで先行**できるため待ち時間を作らない。

---

## 6. 週次マイルストーン（目安・約4週）

| 週        | ゴール                                                               |
| --------- | -------------------------------------------------------------------- |
| W0(1–2日) | Day 0 契約（S1–S5）確定。両チーム着手可能に                          |
| W1        | A：ES索引＋検索＋埋め込み / B：基盤・SQL・モックサーバ               |
| W2        | A：推薦・蘊蓄API動作 / B：管理・取り込み・参照API動作 → **初回結合** |
| W3        | A↔B結合、シード投入、Should（旅程・クーポン）                        |
| W4        | デモ用チューニング・安定化・デプロイ確定                             |

---

## 7. リスクと対応

| リスク                               | 対応                                             |
| ------------------------------------ | ------------------------------------------------ |
| 取り込み(B4)が索引(A3)に依存し詰まる | A3の関数I/Fを最優先で確定し、Bはスタブで先行     |
| 蘊蓄(A6)がSQLリポジトリ(B2)に依存    | B2リポジトリI/Fを先に切り、Aはモックデータで開発 |
| Maps/Gemini のキー・課金で詰まる     | W1にSecret Manager(B1)＋疎通確認を済ませる       |
| 結合が後ろ倒し                       | W2末に**強制結合日**を設定                       |
