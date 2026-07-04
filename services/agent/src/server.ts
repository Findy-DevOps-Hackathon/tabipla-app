import { InMemoryRunner, stringifyContent } from "@google/adk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { collectAgent, COLLECT_CATEGORIES, parseCollectResult } from "./agents/collect.js";
import { analyzeFeedback } from "./agents/feedback.js";
import { askIntroduce } from "./agents/introduce.js";
import { personalizedPlan } from "./agents/personalized.js";
import { recommendAgent } from "./agents/recommend.js";
import { ask } from "./agents/run.js";
import { story } from "./agents/unchiku.js";
import { KOMORO_SPOTS, SPOT_IMAGES, SPOT_TAGS } from "./fixtures/spots.js";
import { summarizeProfile, userProfiles } from "./personalize.js";
import { sceneSvg } from "./sceneSvg.js";
import { toolCallStorage } from "./tools/tracker.js";
import { pageHtml, swipePageHtml } from "./ui.js";

const app = new Hono();

app.use("*", async (c, next) => {
  return toolCallStorage.run({ count: 0 }, next);
});

// admin-web(5174) からのクロスオリジン呼び出しを許可（ローカル開発用）
app.use("/v1/*", cors());

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
    travelMemory = "",
  } = await c.req.json<{
    likes?: string[];
    nopes?: string[];
    userId?: string;
    timeBudget?: string;
    origin?: string;
    travelMemory?: string;
  }>();
  try {
    const res = await personalizedPlan({ likes, nopes }, userId, timeBudget, origin, travelMemory);
    return c.json(res);
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) });
  }
});

// スポットのGood/Badフィードバック
app.post("/v1/personalized/feedback/spot", async (c) => {
  const {
    userId = "demo",
    spotId,
    rating,
  } = await c.req.json<{
    userId?: string;
    spotId: string;
    rating: "good" | "bad";
  }>();

  try {
    const profile = userProfiles.get(userId);
    if (!profile) {
      return c.json({ error: "プロフィールが見つかりません" }, 400);
    }

    const result = await analyzeFeedback(
      {
        currentFeedbackNotes: profile.feedbackNotes,
        currentIntroStyle: profile.introStyle,
        spotFeedbacks: [{ spotId, rating }],
      },
      userId,
    );

    profile.feedbackNotes = result.feedbackNotes;
    profile.introStyle = result.introStyle;
    userProfiles.set(userId, profile);

    return c.json({
      success: true,
      feedbackNotes: profile.feedbackNotes,
      introStyle: profile.introStyle,
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) }, 500);
  }
});

// 旅行終了後のフィードバック
app.post("/v1/personalized/feedback/trip", async (c) => {
  const {
    userId = "demo",
    rating,
    comment,
    spotFeedbacks = [],
  } = await c.req.json<{
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

    const result = await analyzeFeedback(
      {
        currentFeedbackNotes: profile.feedbackNotes,
        currentIntroStyle: profile.introStyle,
        spotFeedbacks,
        tripFeedback: { rating, comment },
      },
      userId,
    );

    profile.feedbackNotes = result.feedbackNotes;
    profile.introStyle = result.introStyle;
    userProfiles.set(userId, profile);

    return c.json({
      success: true,
      feedbackNotes: profile.feedbackNotes,
      introStyle: profile.introStyle,
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) }, 500);
  }
});

// 紹介エージェントへのマルチモーダルな質問
app.post("/v1/spots/:id/ask", async (c) => {
  const spotId = c.req.param("id");
  const {
    text,
    image,
    audio,
    userId = "demo",
  } = await c.req.json<{
    text?: string;
    image?: { mimeType: string; data: string };
    audio?: { mimeType: string; data: string };
    userId?: string;
  }>();

  try {
    const profile = userProfiles.get(userId);
    const profileSummary = profile ? summarizeProfile(profile) : "";
    const introStyle = profile ? profile.introStyle : "";

    const answer = await askIntroduce(
      {
        spotId,
        text,
        image,
        audio,
        introStyle,
        userProfileSummary: profileSummary,
      },
      userId,
    );

    return c.json({ answer });
  } catch (e) {
    console.error(e);
    return c.json({ answer: friendly(e) });
  }
});

// スポット名の照合用に表記ゆれを吸収する（空白・括弧書きの差を無視）
function normalizeSpotName(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

// ネットワーク瞬断など、リトライで回復し得る一過性エラーか判定する。
function isTransientError(msg: string): boolean {
  return /fetch failed|UNKNOWN_ERROR|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|network|50[234]/i.test(
    msg,
  );
}

// 収集エージェントを1回実行し、最終出力とエラーメッセージを返す。
async function runCollectOnce(prompt: string): Promise<{ final: string; errMsg: string }> {
  const runner = new InMemoryRunner({ agent: collectAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "admin",
  });

  let final = "";
  let errMsg = "";
  for await (const event of runner.runAsync({
    userId: "admin",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const e = event as { errorCode?: string; errorMessage?: string };
    if (e.errorCode) errMsg = `[${e.errorCode}] ${e.errorMessage ?? ""}`;
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }
  return { final, errMsg };
}

// 観光データ収集
app.post("/v1/collect-spots", async (c) => {
  const {
    municipality,
    prefecture,
    targetCount = 100,
    categories = [],
    excludeNames = [],
  } = await c.req.json<{
    municipality: string;
    prefecture: string;
    targetCount?: number;
    /** 収集対象カテゴリ（1件以上必須）。 */
    categories?: string[];
    /** 既に登録済みのスポット名。収集結果から除外する。 */
    excludeNames?: string[];
  }>();
  if (!municipality || !prefecture) {
    return c.json({ error: "municipality と prefecture は必須です" }, 400);
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return c.json({ error: "categories は1件以上必須です" }, 400);
  }
  const allowed = new Set<string>(COLLECT_CATEGORIES);
  const invalid = categories.filter((cat) => !allowed.has(cat));
  if (invalid.length > 0) {
    return c.json({ error: `不正なカテゴリ: ${invalid.join(", ")}` }, 400);
  }

  try {
    const excludeBlock =
      excludeNames.length > 0
        ? `\n\n【除外リスト】以下のスポットは既に登録済みなので、出力に含めないこと:\n${excludeNames.map((n) => `- ${n}`).join("\n")}`
        : "";

    const categoryList = categories.map((cat) => `- ${cat}`).join("\n");
    const focusBlock = `以下のカテゴリに該当する観光地のみを収集してください。各スポットには最も適切なカテゴリを1つだけ付与すること（次のいずれかのみ）:
${categoryList}

カテゴリの目安:
- 自然: 公園、滝、山、高原、渓谷、ビューポイントなど
- 歴史・文化: 城跡、史跡、伝統文化、郷土資料館など
- 都市: 街並み、都市景観、ランドマーク建築など
- 芸術: 美術館、博物館、ギャラリー、文化施設など
- 食: 郷土料理・食文化が主役の観光スポット（単独の飲食店は除く）
- レジャー・スポーツ: スキー場、サイクリング、屋外アクティビティ施設など
- イベント: 祭り、花火大会、季節イベントの名所など
- ショッピング: 商店街、道の駅、特産品市場など

選択されたカテゴリ全体からバランスよく収集し、該当しないカテゴリのスポットは無理に含めないこと。`;

    const prompt = `${prefecture}${municipality}の観光地を${targetCount}件を目標に収集してください。
${focusBlock}${excludeBlock}`;

    const MAX_ATTEMPTS = 3;
    let final = "";
    let errMsg = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await runCollectOnce(prompt);
      final = res.final;
      errMsg = res.errMsg;
      if (final) break;
      if (!isTransientError(errMsg)) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[collect] 一過性エラーのため再試行します (${attempt}/${MAX_ATTEMPTS}): ${errMsg}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (!final) {
      const message = isTransientError(errMsg)
        ? "⚠️ ネットワークエラーで収集に失敗しました。通信状況を確認して、もう一度お試しください。"
        : errMsg || "エージェントから空の応答が返りました";
      return c.json({ error: message }, 500);
    }

    const result = parseCollectResult(final);
    const excludeSet = new Set(excludeNames.map(normalizeSpotName));
    const spots = result.spots.filter((s) => !excludeSet.has(normalizeSpotName(s.name)));
    return c.json({
      municipality,
      prefecture,
      count: spots.length,
      spots,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(
  `agent listening on http://localhost:${port}  (USE_MOCK=${process.env.USE_MOCK ?? "1"})`,
);
