import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { personalizedPlan } from "./agents/personalized.js";
import { recommendAgent } from "./agents/recommend.js";
import { ask } from "./agents/run.js";
import { story } from "./agents/unchiku.js";
import { KOMORO_SPOTS, SPOT_IMAGES, SPOT_TAGS } from "./fixtures/spots.js";
import { sceneSvg } from "./sceneSvg.js";
import { pageHtml, swipePageHtml } from "./ui.js";
import { userProfiles, summarizeProfile } from "./personalize.js";
import { askIntroduce } from "./agents/introduce.js";
import { analyzeFeedback } from "./agents/feedback.js";

const app = new Hono();

// スワイプUI(主役)。開発用パネルは /dev。
app.get("/", (c) => c.html(swipePageHtml));
app.get("/dev", (c) => c.html(pageHtml));

app.get("/healthz", (c) => c.json({ ok: true }));

// カード用の生成SVG風景（デモ用。後で実写真URLに差し替え可）
app.get("/img/:id", (c) => {
  const id = c.req.param("id");
  const spot = KOMORO_SPOTS.find((x) => x.id === id);
  const seed = id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return c.body(sceneSvg(spot?.category ?? "nature", seed), 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  });
});

// スワイプ用カタログ（タグ・画像込み）。本番はDB/検索から。
app.get("/v1/spots", (c) =>
  c.json({
    spots: KOMORO_SPOTS.map((s) => ({
      ...s,
      tags: SPOT_TAGS[s.id] ?? [],
      image: SPOT_IMAGES[s.id] ?? "",
    })),
  }),
);

// モデルエラーをUI向けの文言に整える
function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|quota|rate/i.test(msg)) {
    return "⚠️ レート制限（Geminiのリクエスト上限）に達しました。1分ほど待って再試行してください。";
  }
  return `⚠️ エラー: ${msg}`;
}

// A5: 推薦
app.post("/v1/recommendations", async (c) => {
  const { request } = await c.req.json<{ request: string }>();
  try {
    return c.json({ result: await ask(recommendAgent, request) });
  } catch (e) {
    return c.json({ result: friendly(e) });
  }
});

// A6: 蘊蓄
app.post("/v1/spots/:id/story", async (c) => {
  try {
    return c.json({ story: await story(c.req.param("id")) });
  } catch (e) {
    return c.json({ story: friendly(e) });
  }
});

// パーソナライズ: スワイプ→好み学習→エージェント間のディベートを経てプラン提案
app.post("/v1/personalized/plan", async (c) => {
  const {
    likes = [],
    nopes = [],
    userId = "demo",
    timeBudget = "4時間",
    origin = "小諸駅",
  } = await c.req.json<{
    likes?: string[];
    nopes?: string[];
    userId?: string;
    timeBudget?: string;
    origin?: string;
  }>();
  try {
    const res = await personalizedPlan({ likes, nopes }, userId, timeBudget, origin);
    return c.json(res);
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) });
  }
});

// スポットのGood/Badフィードバック
app.post("/v1/personalized/feedback/spot", async (c) => {
  const { userId = "demo", spotId, rating } = await c.req.json<{
    userId?: string;
    spotId: string;
    rating: "good" | "bad";
  }>();

  try {
    const profile = userProfiles.get(userId);
    if (!profile) {
      return c.json({ error: "プロフィールが見つかりません" }, 400);
    }

    const result = await analyzeFeedback({
      currentFeedbackNotes: profile.feedbackNotes,
      currentIntroStyle: profile.introStyle,
      spotFeedbacks: [{ spotId, rating }],
    }, userId);

    profile.feedbackNotes = result.feedbackNotes;
    profile.introStyle = result.introStyle;
    userProfiles.set(userId, profile);

    return c.json({ success: true, feedbackNotes: profile.feedbackNotes, introStyle: profile.introStyle });
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) }, 500);
  }
});

// 旅行終了後のフィードバック
app.post("/v1/personalized/feedback/trip", async (c) => {
  const { userId = "demo", rating, comment, spotFeedbacks = [] } = await c.req.json<{
    userId?: string;
    rating: number;
    comment: string;
    spotFeedbacks?: { spotId: string; rating: "good" | "bad" }[];
  }>();

  try {
    const profile = userProfiles.get(userId);
    if (!profile) {
      return c.json({ error: "プロフィールが見つかりません" }, 400);
    }

    const result = await analyzeFeedback({
      currentFeedbackNotes: profile.feedbackNotes,
      currentIntroStyle: profile.introStyle,
      spotFeedbacks,
      tripFeedback: { rating, comment },
    }, userId);

    profile.feedbackNotes = result.feedbackNotes;
    profile.introStyle = result.introStyle;
    userProfiles.set(userId, profile);

    return c.json({ success: true, feedbackNotes: profile.feedbackNotes, introStyle: profile.introStyle });
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) }, 500);
  }
});

// 紹介エージェントへのマルチモーダルな質問
app.post("/v1/spots/:id/ask", async (c) => {
  const spotId = c.req.param("id");
  const { text, image, audio, userId = "demo" } = await c.req.json<{
    text?: string;
    image?: { mimeType: string; data: string };
    audio?: { mimeType: string; data: string };
    userId?: string;
  }>();

  try {
    const profile = userProfiles.get(userId);
    const profileSummary = profile ? summarizeProfile(profile) : "";
    const introStyle = profile ? profile.introStyle : "";

    const answer = await askIntroduce({
      spotId,
      text,
      image,
      audio,
      introStyle,
      userProfileSummary: profileSummary,
    }, userId);

    return c.json({ answer });
  } catch (e) {
    console.error(e);
    return c.json({ answer: friendly(e) });
  }
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(
  `agent listening on http://localhost:${port}  (USE_MOCK=${process.env.USE_MOCK ?? "1"})`,
);
