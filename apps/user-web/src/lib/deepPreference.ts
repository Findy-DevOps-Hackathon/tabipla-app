export type PreferenceInsight = {
  themeSummary: string;
  deepNeedLabel: string;
};

const DEEP_NEED_PREFIX = "深層ニーズ:";

export function parsePreferenceSummary(summary?: string): PreferenceInsight | null {
  const text = summary?.trim();
  if (!text) return null;

  const [themePart = "", deepPart = ""] = text.split("/");
  const themeSummary = themePart.replace(/^心が動く体験:\s*/, "").trim();
  const deepNeedLabel = deepPart.replace(DEEP_NEED_PREFIX, "").trim();

  if (!themeSummary && !deepNeedLabel) return null;
  return { themeSummary, deepNeedLabel };
}
