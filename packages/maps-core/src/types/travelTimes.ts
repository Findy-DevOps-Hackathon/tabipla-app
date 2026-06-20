/**
 * A4 契約型定義（S4 FunctionTool シグネチャ合意）
 *
 * A5 推薦エージェントが FunctionTool として getTravelTimes を呼び出す際の
 * 入出力インターフェース。変更は A4/A5 両チームの合意が必要。
 */

/** Google Maps Routes API でサポートする移動手段。 */
export type TravelMode = "DRIVE" | "WALK" | "TRANSIT" | "BICYCLE";

/** 緯度経度。SpotDocument.location と同じ構造体。 */
export type LatLng = {
  lat: number;
  lon: number;
};

/**
 * getTravelTimes への入力パラメータ。
 *
 * - origin は通常「拠点/現在地」の1点。
 * - destinations は推薦エージェントが絞り込んだ上位N件のスポット座標。
 *   maxDestinations を超える件数は内部で切り捨てる（コスト/レイテンシ対策）。
 * - modes を省略すると ["DRIVE"] のみで計算する。
 */
export type TravelTimesParams = {
  /** 出発地（拠点・現在地）。 */
  origin: LatLng;
  /** 目的地リスト（上位N件のスポット座標）。maxDestinations 件に制限される。 */
  destinations: LatLng[];
  /** 計算する移動手段。省略時は ["DRIVE"]。 */
  modes?: TravelMode[];
  /**
   * 出発日時（ISO 8601）。
   * TRANSIT の所要時間計算や DRIVE の渋滞考慮に使用する。
   * 省略時は Routes API の既定（現在時刻）で計算される。
   */
  departureTime?: string;
  /**
   * destinations の最大件数。これを超える分は先頭から切り捨てる。
   * 既定は MAX_DESTINATIONS_DEFAULT（25）。
   * Routes API の上限（最大 625 要素: origins×destinations）を超えないよう制限する。
   */
  maxDestinations?: number;
};

/** ルート1本分の計算結果。 */
export type TravelLeg = {
  /** destinations 配列のインデックス（0始まり）。 */
  destinationIndex: number;
  /** 所要時間（秒）。到達不可の場合は null。 */
  durationSeconds: number | null;
  /** 距離（メートル）。到達不可の場合は null。 */
  distanceMeters: number | null;
  /** ルート計算の状態。 */
  status: "OK" | "NOT_FOUND" | "ZERO_RESULTS" | "MAX_WAYPOINTS_EXCEEDED";
};

/**
 * getTravelTimes の出力。移動手段ごとに destinations 分の結果を保持する。
 *
 * `results[mode][i]` が `destinations[i]` への所要時間/距離に対応する。
 * 計算できなかった手段のエントリは省略される（キーが存在しない）。
 */
export type TravelTimeMatrix = {
  /** 出発地（入力をそのまま返す）。 */
  origin: LatLng;
  /** 実際に計算した destinations（maxDestinations 適用後）。 */
  destinations: LatLng[];
  /** 手段別の計算結果。 */
  results: Partial<Record<TravelMode, TravelLeg[]>>;
};
