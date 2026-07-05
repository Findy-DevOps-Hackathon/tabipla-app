/**
 * 緯度経度。Elasticsearch の geo_point にマッピングする。
 */
export type GeoPoint = {
  lat: number;
  lon: number;
};

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
  /** カテゴリ（最大3件。例: 観光 / グルメ / 宿泊 / 自然）。 */
  category?: string | string[];
  /** エリア・地域名（例: 京都市）。 */
  area?: string;
  /** 都道府県。 */
  prefecture?: string;
  /** 住所。 */
  address?: string;
  /** タグ（例: ["寺", "紅葉"]）。 */
  tags?: string[];
  /** おすすめポイント（例: ["紅葉の名所", "城址散策"]）。 */
  highlights?: string[];
  /** スポット画像 URL。 */
  imageUrl?: string;
  /** 緯度経度。geo_point 検索・距離計算に利用する。 */
  location?: GeoPoint;
  /** 参考価格（円）。フィルタ・表示用。 */
  price?: number;
  /**
   * ベクトル検索用の埋め込みベクトル。
   * 生成処理は search-core の責務外（将来 agent-api 等で生成する）。
   */
  embedding?: number[];
  /** 作成日時（ISO 8601 文字列を想定）。 */
  createdAt?: string;
  /** 更新日時（ISO 8601 文字列を想定）。 */
  updatedAt?: string;
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
