import type { SearchResult, SpotDocument } from "../types/spot.js";

/**
 * RRF（Reciprocal Rank Fusion / 順位ベース融合）のデフォルト順位定数 k。
 * Elasticsearch / 学術文献で広く使われる既定値 60 を採用する。
 * 小さいほど上位の順位差を強調し、大きいほど順位差を平準化する。
 */
export const DEFAULT_RRF_RANK_CONSTANT = 60;

export type RrfOptions = {
  /** 順位定数 k。省略時は DEFAULT_RRF_RANK_CONSTANT。 */
  rankConstant?: number;
  /** 融合後に返す件数。省略時は全件。 */
  size?: number;
};

/**
 * 複数の検索結果リストを RRF（順位ベース融合）で統合する。
 *
 * 各ドキュメントのスコアは、出現した各リストでの順位 rank（1始まり）に対して
 *   score = Σ 1 / (rankConstant + rank)
 * を合計した値になる。スコアの絶対値（キーワードの BM25 と kNN の cosine など
 * スケールの異なる値）に依存せず、順位だけで統合するため、加算方式より
 * 安定したハイブリッド順位が得られる。
 *
 * - 同一ドキュメントは `id` で名寄せする。
 * - 返り値の `score` は RRF スコア（降順）。元の検索スコアではない点に注意。
 *
 * @param rankedLists 順位順（スコア降順）に並んだ検索結果リストの配列
 * @param options 順位定数・件数
 */
export function reciprocalRankFusion<T extends SpotDocument = SpotDocument>(
  rankedLists: SearchResult<T>[][],
  options: RrfOptions = {},
): SearchResult<T>[] {
  const rankConstant = options.rankConstant ?? DEFAULT_RRF_RANK_CONSTANT;
  if (!Number.isFinite(rankConstant) || rankConstant <= 0) {
    throw new Error(
      `[search-core] reciprocalRankFusion: rankConstant には正の数を指定してください。受け取った値: ${rankConstant}`,
    );
  }

  const fused = new Map<string, { score: number; document: T }>();

  for (const list of rankedLists) {
    list.forEach((result, index) => {
      const rank = index + 1;
      const contribution = 1 / (rankConstant + rank);
      const existing = fused.get(result.id);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(result.id, { score: contribution, document: result.document });
      }
    });
  }

  const merged = [...fused.entries()]
    .map(([id, { score, document }]) => ({ id, score, document }))
    .sort((a, b) => b.score - a.score);

  return options.size !== undefined ? merged.slice(0, options.size) : merged;
}
