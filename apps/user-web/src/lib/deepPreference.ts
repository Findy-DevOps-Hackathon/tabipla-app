import type { Recommendation } from "../data/spots.ts";

export type PreferenceInsight = {
  themeSummary: string;
  deepNeedLabel: string;
};

const DEEP_NEED_PREFIX = "深層ニーズ:";

function firstSentence(text?: string): string {
  const value = text?.trim();
  if (!value) return "";
  const end = value.indexOf("。");
  return end === -1 ? value : value.slice(0, end + 1);
}

export function parsePreferenceSummary(summary?: string): PreferenceInsight | null {
  const text = summary?.trim();
  if (!text) return null;

  const [themePart = "", deepPart = ""] = text.split("/");
  const themeSummary = themePart.replace(/^心が動く体験:\s*/, "").trim();
  const deepNeedLabel = deepPart.replace(DEEP_NEED_PREFIX, "").trim();

  if (!themeSummary && !deepNeedLabel) return null;
  return { themeSummary, deepNeedLabel };
}

export function buildPreferenceSpotReason(
  rec: Recommendation,
  insight: PreferenceInsight | null,
): string {
  const firstHighlight = rec.highlights?.find(Boolean);
  const spotCue = firstSentence(firstHighlight || rec.description);

  if (insight?.deepNeedLabel) {
    const cue = spotCue ? ` ${spotCue}` : "";
    return `あなたの「${insight.deepNeedLabel}」に合いそうです。${cue}`.trim();
  }

  if (insight?.themeSummary && insight.themeSummary !== "探索中") {
    const cue = spotCue ? ` ${spotCue}` : "";
    return `あなたが惹かれた「${insight.themeSummary}」に近い体験ができそうです。${cue}`.trim();
  }

  return rec.reason;
}
