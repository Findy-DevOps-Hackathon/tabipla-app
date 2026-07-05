import type { Spot } from "../contracts.js";
import { KOMORO_SPOTS, SPOT_IMAGES, SPOT_TAGS } from "../fixtures/spots.js";
import {
  buildProfile,
  rankSpots,
  type Swipes,
  summarizeProfile,
  userProfiles,
} from "../personalize.js";
import { runDebate } from "./debate.js";

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
  debate?: { agent: "recommend" | "route" | "introduce"; thought?: string; message: string }[];
}

export async function personalizedPlan(
  sw: Swipes,
  userId = "demo",
  timeBudget = "4時間",
  origin = "小諸駅",
  travelMemory = "",
  catalog: Spot[] = KOMORO_SPOTS,
): Promise<PersonalizedResult> {
  if (catalog.length === 0) {
    const profile = buildProfile(sw, catalog);
    return {
      profileSummary: summarizeProfile(profile),
      recommendations: [],
      result: "小諸市の観光スポットが登録されていません。",
    };
  }

  // 好みプロファイルの構築/取得
  const profile = buildProfile(sw, catalog);
  const existing = userProfiles.get(userId);
  if (existing) {
    // 過去のフィードバックによって学習したメモを引き継ぐ
    profile.feedbackNotes = existing.feedbackNotes;
    profile.introStyle = existing.introStyle;
  }
  userProfiles.set(userId, profile);

  const profileSummary = summarizeProfile(profile);

  // ディベート（エージェント間会議）を実行
  const debateRes = await runDebate(
    {
      userProfileSummary: profileSummary,
      feedbackNotes: profile.feedbackNotes,
      introStyle: profile.introStyle,
      timeBudget,
      origin,
      travelMemory,
    },
    userId,
  );

  // ディベートによって決定したスポットを優先してスコアリング
  const ranked = rankSpots(profile, catalog, { excludeNoped: true });

  // ディベートが選んだ最終スポットを優先的に前に持ってくる
  const finalSpotSet = new Set(debateRes.finalSpots);
  const recommendedSpots = ranked.filter((r) => finalSpotSet.has(r.spot.id));
  const otherSpots = ranked.filter((r) => !finalSpotSet.has(r.spot.id));
  const orderedSpots = [...recommendedSpots, ...otherSpots];

  const recommendations: Recommendation[] = orderedSpots.map((r) => ({
    id: r.spot.id,
    name: r.spot.name,
    category: r.spot.category,
    priceLevel: r.spot.priceLevel,
    tags: r.spot.tags?.length ? r.spot.tags : (SPOT_TAGS[r.spot.id] ?? []),
    image: SPOT_IMAGES[r.spot.id] ?? "",
    score: r.score,
    why: r.why,
  }));

  return {
    profileSummary,
    recommendations,
    result: debateRes.summary,
    debate: debateRes.debate,
  };
}
