export type AgentSpotCategory = "nature" | "gourmet" | "history";

const AGENT_CATEGORY_BY_JP: Record<string, AgentSpotCategory> = {
  自然: "nature",
  "歴史・文化": "history",
  食: "gourmet",
  都市: "history",
  芸術: "history",
  "レジャー・スポーツ": "nature",
  イベント: "gourmet",
  ショッピング: "gourmet",
};

/** 管理画面カテゴリ1件を agent の大カテゴリへ変換する。 */
export function toAgentCategory(adminCategory: string): AgentSpotCategory {
  const trimmed = adminCategory.trim();
  const mapped = AGENT_CATEGORY_BY_JP[trimmed];
  if (mapped) return mapped;
  if (/グルメ|食/.test(trimmed)) return "gourmet";
  if (/自然|高原|絶景/.test(trimmed)) return "nature";
  if (/歴史|文化|遺産|神社|城/.test(trimmed)) return "history";
  return "history";
}

/** 複数カテゴリから agent の大カテゴリを選ぶ（seed / ES ドキュメント向け）。 */
export function pickAgentCategory(categories: string[]): AgentSpotCategory {
  for (const category of categories) {
    const mapped = AGENT_CATEGORY_BY_JP[category.trim()];
    if (mapped) return mapped;
  }
  return "nature";
}
