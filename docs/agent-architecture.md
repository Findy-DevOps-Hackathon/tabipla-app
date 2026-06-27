# Tabipla エージェント & データベース アーキテクチャ

本ドキュメントは、旅行提案アプリ「旅サキ」におけるマルチエージェント協調フレームワーク、マルチモーダル紹介エージェント、および学習（フィードバック）ループとデータベース（PostgreSQL / Drizzle）のデータ永続化設計について解説します。

---

## 1. 全体アーキテクチャ概要

本システムは、それぞれに固有の専門性と指示（System Instruction）を持った複数のエージェントが協調して動作する「マルチエージェント・フィードバックループ」構成を採用しています。

```mermaid
graph TD
    User([ユーザー]) -->|旅行条件/好み入力| DevUi[フロントエンド UI]
    DevUi -->|APIリクエスト| DebateAgent[① ディベート調整エージェント]
    
    subgraph バックステージ（作戦会議）
        DebateAgent -->|条件提示| RecAgent[推薦エージェント]
        DebateAgent -->|ルート制約確認| RouteAgent[ルート計画エージェント]
        DebateAgent -->|トーン調整| IntroAgent[紹介エージェント]
        RecAgent -->|候補地提示| DebateAgent
        RouteAgent -->|所要時間チェック| DebateAgent
        IntroAgent -->|紹介スタイル評価| DebateAgent
    end

    DebateAgent -->|合意プラン + 会議ログ| DevUi
    DevUi -->|Good/Bad評価 & 星/コメント| FbAgent[② フィードバック学習エージェント]
    FbAgent -->|プロファイル更新| Db[(PostgreSQL DB)]
    Db -.->|次回の会議で考慮| DebateAgent

    DevUi -->|画像・音声で質問| IntroAgent
    IntroAgent -->|事実に基づくパーソナライズ解説| User
```

---

## 2. エージェントの役割と協調設計

### ① ディベート（作戦会議）コーディネーター (`debateAgent`)
ユーザーが「結果を見る」を選択した際、裏で自律的な作戦会議（ディベート）を実行します。
* **推薦エージェント (recommend)**: ユーザーの好みのカテゴリ/タグを最優先し、それに合致する魅力的なスポットを提案。
* **ルート計画エージェント (route)**: 出発地からの移動時間や滞在時間を計算し、時間予算内に収まるか、ルートが物理的に破綻していないかをチェック。
* **紹介エージェント (introduce)**: スポットのおすすめポイントや楽しみ方がユーザーの紹介スタイルに合うかを評価し、滞在時間の調整や差し替え案を提示。
* **出力**: 3者のリアルなディベート対話ログ（JSONB）と、最終合意されたスポットIDリスト。

### ② マルチモーダル紹介エージェント (`introduceAgent`)
選定された観光スポットのパーソナライズ紹介と、ユーザーからのリアルタイム質問に応答します。
* **インプット**: スポットの正確な事実 (`facts`), `PreferenceProfile` (好み + `introStyle`), ユーザーからの質問（テキスト/画像/音声データ）。
* **マルチモーダル処理**: 添付されたカメラ写真や、マイク録音された音声データをGeminiの `inlineData` としてダイレクトにモデルへ入力し、画像を解析したり音声の意図を汲み取った上で、ハルシネーションを防いだ解説を生成します。

### ③ フィードバック・学習エージェント (`feedbackAgent`)
ユーザーからの明示的な評価を解釈し、エージェント全体の精度を向上させるエンジン。
* **トリガー**: スポットに対する Good/Bad ボタンのクリック、または旅行終了後の全体星評価（1-5）とコメント送信。
* **学習内容**: LLMがフィードバックの心理を分析し、**「推薦の好みメモ（`feedbackNotes`）」** と **「紹介の解説スタイル（`introStyle`）」** を動的に更新し、DBに永続化します。

---

## 3. データベース永続化スキーマ（PostgreSQL / Drizzle）

エージェントが学習した成果や、やり取りのログを永続化するため、以下のテーブルを `packages/db/src/schema.ts` に追加・統合しています。

```typescript
// 1. ユーザーの好みプロファイル・学習データ
export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull().unique(),            // デモID対応のため references なし
  categoryScore: jsonb("category_score"),                // カテゴリごとのスコア (JSONB)
  tagScore: jsonb("tag_score"),                          // 特徴タグごとのスコア (JSONB)
  preferredPriceMax: integer("preferred_price_max"),     // 許容最高価格
  likedIds: text("liked_ids").array(),                   // いいねしたスポットID配列
  nopedIds: text("noped_ids").array(),                   // 興味なしにしたスポットID配列
  feedbackNotes: text("feedback_notes").default("").notNull(), // 推薦の好み傾向メモ（AI書き込み）
  introStyle: text("intro_style").default("").notNull(),       // 紹介のトーン＆マナーメモ（AI書き込み）
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. おすすめに対するGood/Badフィードバック
export const spotFeedbacks = pgTable("spot_feedbacks", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  spotId: text("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(), // "good" | "bad"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. 旅行全体のフィードバック
export const tripFeedbacks = pgTable("trip_feedbacks", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(), // 星評価（1〜5）
  comment: text("comment"),            // フリーテキストコメント
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 4. 旅行プラン ＆ ディベート会話ログ
export const tripPlans = pgTable("trip_plans", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  origin: text("origin").notNull(),
  timeBudget: text("time_budget").notNull(),
  finalSpots: text("final_spots").array().notNull(),
  summary: text("summary").notNull(),
  debateLog: jsonb("debate_log").notNull(), // 会議ログ（配列）を格納
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 4. フィードバックループの仕組み

1. **初期データ抽出**: スワイプ情報から静的スコアリングにより基本プロフィールが生成されます。
2. **ディベート**: コーディネーターが条件（出発地・時間）とプロフィールを基に議論を開始。
3. **提案**: 合意プランと「議論ログ」がUIに描画され、ユーザーはAIたちの思考プロセスをタイムラインで覗けます。
4. **フィードバック**: ユーザーが Good/Bad や最終コメントを入力。
5. **自己更新（メタ学習）**: `feedbackAgent` がフィードバックを言語化・分析し、`feedbackNotes` と `introStyle` を更新してDBに格納。次回のディベート時、AIたちのインプットプロンプトにこのメモが引き継がれ、自律的に精度が改善されます。
