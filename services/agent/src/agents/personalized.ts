import { KOMORO_SPOTS, SPOT_IMAGES, SPOT_TAGS } from "../fixtures/spots.js";
import { buildProfile, rankSpots, type Swipes, summarizeProfile } from "../personalize.js";
import { recommendAgent } from "./recommend.js";
import { ask } from "./run.js";

// スワイプの好み学習(コード・決定的) → その好みで「推薦エージェント」が
// 「あなた向けのおすすめ」を返す。専用のプランナーエージェントは使わない（2エージェント構成）。

export interface Recommendation {
  id: string;
  name: string;
  category: string;
  priceLevel: number;
  tags: string[];
  image: string;
  score: number;
  why: string[];
}
export interface PersonalizedResult {
  profileSummary: string;
  recommendations: Recommendation[]; // 好み学習による並べ替え（表示用）
  result: string; // 推薦エージェントの「あなた向けのおすすめ」文
}

export async function personalizedPlan(sw: Swipes): Promise<PersonalizedResult> {
  const profile = buildProfile(sw, KOMORO_SPOTS);
  const ranked = rankSpots(profile, KOMORO_SPOTS, { excludeNoped: true });

  const recommendations: Recommendation[] = ranked.slice(0, 5).map((r) => ({
    id: r.spot.id,
    name: r.spot.name,
    category: r.spot.category,
    priceLevel: r.spot.priceLevel,
    tags: SPOT_TAGS[r.spot.id] ?? [],
    image: SPOT_IMAGES[r.spot.id] ?? "",
    score: r.score,
    why: r.why,
  }));

  const profileSummary = summarizeProfile(profile);
  const topNames = recommendations
    .slice(0, 3)
    .map((r) => r.name)
    .join("、");
  const request = `小諸の観光で、次の好み傾向の人に合うおすすめスポットを提案して。\n好み: ${profileSummary}${
    topNames ? `\n特に「${topNames}」のような所が好み。` : ""
  }`;
  const result = await ask(recommendAgent, request);

  return { profileSummary, recommendations, result };
}
