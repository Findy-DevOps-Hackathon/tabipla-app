/**
 * 観光スポット（Spot）ドキュメント。検索の1ドキュメントに相当するドメイン型。
 *
 * tabipla（旅行プラン）における検索対象の中心エンティティ。
 * 旧 `SearchDocument`（汎用型）をドメイン確定に伴い置き換えたもの。
 */
export type SpotDocument = {
  /** スポットの一意なID。Elasticsearch の _id として利用する。 */
  id: string;
  /** スポット名（旧 title）。キーワード検索の主対象。 */
  name: string;
  /** 説明・本文（旧 content）。キーワード検索対象。 */
  description: string;
  /** カテゴリ（最大3件。例: 観光 / グルメ / 自然 / 歴史）。 */
  category?: string | string[];
  /** エリア・地域名（例: 京都市）。 */
  area?: string;
  /** 都道府県。 */
  prefecture?: string;
  /** 住所。 */
  address?: string;
  /** おすすめポイント（例: ["紅葉の名所", "城址散策"]）。 */
  highlights?: string[];
  /** スポット画像 URL。 */
  imageUrl?: string;
  /**
   * ベクトル検索用の埋め込みベクトル。
   * 生成処理は search-core の責務外（将来 agent-api 等で生成する）。
   */
  embedding?: number[];
  /** 作成日時（ISO 8601 文字列を想定）。 */
  createdAt?: string;
  /** 更新日時（ISO 8601 文字列を想定）。 */
  updatedAt?: string;
  /** クラスタリングID（事前クラスタリングによる分類）。 */
  clusterId?: number;
  /** 9次元の感性・知名度スコアオブジェクト */
  sensoryScores?: {
    nature: number;
    history: number;
    art: number;
    entertainment: number;
    gourmet: number;
    activity: number;
    quietness: number;
    indoor: number;
    popularity: number;
  };
};

/**
 * 検索結果1件分の型。Elasticsearch のスコアと元ドキュメントを保持する。
 * （ドメイン非依存の汎用ラッパー。既定の対象は SpotDocument）
 */
export type SearchResult<T extends SpotDocument = SpotDocument> = {
  /** ドキュメントID。 */
  id: string;
  /** Elasticsearch が算出した関連スコア（null の場合がある）。 */
  score: number | null;
  /** 元のドキュメント本体（_source）。 */
  document: T;
};
