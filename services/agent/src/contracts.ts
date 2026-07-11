// agentサービス内の共通型（旧 @tabisaki/contracts を移植）。
// 本データ結合時は @tabipla/search-core の SpotDocument 等に寄せる/変換する。

export interface Spot {
  id: string;
  name: string;
  category: string; // 使える値は nature / gourmet / history
  description?: string;
  highlights?: string[];
}

// ① 候補検索（本データは @tabipla/search-core searchCandidateSpots）
export interface SearchInput {
  query: string; // 自然文の検索意図
  category?: string[]; // nature / gourmet / history（OR）
  k?: number; // 取得件数（既定8）
}
export type SearchFn = (i: SearchInput) => Promise<Spot[]>;
