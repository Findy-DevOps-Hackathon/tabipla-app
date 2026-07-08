import { InMemoryRunner, type LlmAgent, stringifyContent } from "@google/adk";
import { serve } from "@hono/node-server";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { extractBearerToken, verifyAdminToken } from "./adminAuth.js";
import {
  COLLECT_CATEGORIES,
  collectAgent,
  MAX_COLLECT_TARGET_COUNT,
  resolveCollectResult,
} from "./agents/collect.js";
import { type DescribeMode, describeAgent, describeSpot } from "./agents/describe.js";
import { askIntroduce } from "./agents/introduce.js";
import { personalizedPlan } from "./agents/personalized.js";
import { recommendAgent } from "./agents/recommend.js";
import { ask } from "./agents/run.js";
import { generateSpotImage } from "./agents/spotImage.js";
import { story } from "./agents/unchiku.js";
import type { Spot } from "./contracts.js";
import { KOMORO_SPOTS, SPOT_IMAGES } from "./fixtures/spots.js";
import { sceneSvg } from "./sceneSvg.js";
import { toolCallStorage } from "./tools/tracker.js";
import { pageHtml, swipePageHtml } from "./ui.js";

const app = new Hono();

app.use("*", async (_c, next) => {
  return toolCallStorage.run({ count: 0 }, next);
});

/** Firebase Hosting /agent/** プロキシ: プレフィックスを除去して既存ルートに合わせる。 */
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/agent/")) return next();
  const url = new URL(c.req.url);
  url.pathname = path.slice("/agent".length) || "/";
  return app.fetch(new Request(url, c.req.raw));
});

// admin-web(5174) からのクロスオリジン呼び出しを許可（ローカル開発用）
app.use("/v1/*", cors());

const requireAdminAuth: MiddlewareHandler = async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));
  if (!token || !verifyAdminToken(token)) {
    return c.json({ error: "認証が必要です" }, 401);
  }
  return next();
};

app.use("/v1/collect-spots", requireAdminAuth);
app.use("/v1/describe-spot", requireAdminAuth);
app.use("/v1/generate-spot-image", requireAdminAuth);

// スワイプUI(主役)。開発用パネルは /dev。
app.get("/", (c) => c.html(swipePageHtml));
app.get("/dev", (c) => c.html(pageHtml));

app.get("/healthz", (c) => c.json({ ok: true }));

// カード用の生成SVG風景（デモ用。後で実写真URLに差し替え可）
app.get("/img/:id", (c) => {
  const id = c.req.param("id");
  const queryCategory = c.req.query("category");
  const spot = KOMORO_SPOTS.find((x) => x.id === id);
  const category = queryCategory || spot?.category || "nature";
  const seed = id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return c.body(sceneSvg(category, seed), 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  });
});

// スワイプ用カタログ（画像込み）。本番はDB/検索から。
app.get("/v1/spots", (c) =>
  c.json({
    spots: KOMORO_SPOTS.map((s) => ({
      ...s,
      image: SPOT_IMAGES[s.id] ?? "",
    })),
  }),
);

const USER_BUSY_MESSAGE = "ただいま混み合っています。1分ほど待ってから再度お試しください。";
const USER_GENERIC_ERROR_MESSAGE =
  "うまく処理できませんでした。しばらく待ってから再度お試しください。";

/** モデル/API 失敗をユーザー向け文言に整える（技術詳細はサーバーログのみ）。 */
function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[agent] request failed:", msg);
  if (/429|quota|rate/i.test(msg)) {
    return USER_BUSY_MESSAGE;
  }
  return USER_GENERIC_ERROR_MESSAGE;
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
    likeWeights,
    travelMemory = "",
    catalog,
    page,
    limit,
    planKey,
  } = await c.req.json<{
    likes?: string[];
    nopes?: string[];
    likeWeights?: Record<string, number>;
    travelMemory?: string;
    catalog?: Spot[];
    page?: number;
    limit?: number;
    planKey?: string;
  }>();
  try {
    const spotCatalog = catalog ?? KOMORO_SPOTS;
    const res = await personalizedPlan({ likes, nopes, likeWeights }, travelMemory, spotCatalog, {
      page,
      limit,
      planKey,
    });
    return c.json(res);
  } catch (e) {
    console.error(e);
    return c.json({ error: friendly(e) });
  }
});

// 紹介エージェントへのマルチモーダルな質問
app.post("/v1/spots/:id/ask", async (c) => {
  const spotId = c.req.param("id");
  const { text, image, audio, spot, facts } = await c.req.json<{
    text?: string;
    image?: { mimeType: string; data: string };
    audio?: { mimeType: string; data: string };
    spot?: {
      name: string;
      description?: string;
      highlights?: string[];
      area?: string;
      prefecture?: string;
      address?: string;
    };
    facts?: string[];
  }>();

  try {
    const answer = await askIntroduce(
      {
        spotId,
        text,
        image,
        audio,
        introStyle: "",
        userProfileSummary: "",
        spot,
        facts,
      },
      spotId,
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

// エージェントを1回実行し、最終出力とエラーメッセージを返す。
async function runAgentOnce(
  agent: LlmAgent,
  prompt: string,
): Promise<{ final: string; errMsg: string }> {
  const runner = new InMemoryRunner({ agent });
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
    targetCount = MAX_COLLECT_TARGET_COUNT,
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
  const effectiveTargetCount = Math.min(
    MAX_COLLECT_TARGET_COUNT,
    Math.max(1, Math.floor(Number(targetCount) || MAX_COLLECT_TARGET_COUNT)),
  );

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

    const prompt = `${prefecture}${municipality}の観光地を${effectiveTargetCount}件を目標に収集してください。
${focusBlock}${excludeBlock}

【出力の再確認】Markdown・見出し・箇条書き・説明文は禁止。{"spots":[{"name":"...","description":"...","highlights":["...","...","..."],"category":"自然","area":"...","prefecture":"...","address":"...","sources":["..."]}]} 形式のJSONだけを出力すること。`;

    const JSON_RETRY_SUFFIX =
      '\n\n【再指示】前回はMarkdownで返したため失敗しました。JSON以外は一切書かず、{"spots":[...]} だけを出力してください。';

    const MAX_ATTEMPTS = 3;
    let final = "";
    let errMsg = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const attemptPrompt = attempt === 1 ? prompt : `${prompt}${JSON_RETRY_SUFFIX}`;
      const res = await runAgentOnce(collectAgent, attemptPrompt);
      final = res.final;
      errMsg = res.errMsg;
      if (final) break;
      if (!isTransientError(errMsg)) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[collect] 一過性エラーのため再試行します (${attempt}/${MAX_ATTEMPTS}): ${errMsg}`,
        );
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (!final) {
      const message = isTransientError(errMsg)
        ? "⚠️ ネットワークエラーで収集に失敗しました。通信状況を確認して、もう一度お試しください。"
        : errMsg || "エージェントから空の応答が返りました";
      return c.json({ error: message }, 500);
    }

    const result = await resolveCollectResult(final, { prefecture, municipality }, runAgentOnce);
    const excludeSet = new Set(excludeNames.map(normalizeSpotName));
    const spots = result.spots
      .filter((s) => !excludeSet.has(normalizeSpotName(s.name)))
      .slice(0, effectiveTargetCount);
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

// 個別登録向け: 指定自治体内の観光地1件について紹介文またはおすすめポイントを生成
app.post("/v1/describe-spot", async (c) => {
  const {
    name,
    municipality,
    prefecture,
    address,
    mode = "description",
  } = await c.req.json<{
    name: string;
    municipality: string;
    prefecture: string;
    address?: string;
    mode?: DescribeMode;
  }>();

  const trimmedName = name?.trim();
  if (!trimmedName || !municipality || !prefecture) {
    return c.json({ error: "name, municipality, prefecture は必須です" }, 400);
  }
  if (mode !== "description" && mode !== "highlights") {
    return c.json({ error: "mode は description または highlights を指定してください" }, 400);
  }

  try {
    const MAX_ATTEMPTS = 3;
    let result: Awaited<ReturnType<typeof describeSpot>> | null = null;
    let errMsg = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        result = await describeSpot(
          { name: trimmedName, municipality, prefecture, address, mode },
          (prompt) => runAgentOnce(describeAgent, prompt),
        );
        break;
      } catch (e) {
        errMsg = e instanceof Error ? e.message : String(e);
        if (!isTransientError(errMsg) || attempt >= MAX_ATTEMPTS) break;
        console.warn(
          `[describe] 一過性エラーのため再試行します (${attempt}/${MAX_ATTEMPTS}): ${errMsg}`,
        );
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (!result) {
      const label = mode === "highlights" ? "おすすめポイント" : "紹介文";
      const message = isTransientError(errMsg)
        ? `⚠️ ネットワークエラーで${label}の生成に失敗しました。通信状況を確認して、もう一度お試しください。`
        : errMsg || `${label}の生成に失敗しました`;
      return c.json({ error: message }, 500);
    }

    if (mode === "highlights") {
      if (result.highlights.length === 0) {
        return c.json(
          {
            error: `${prefecture}${municipality}内で「${trimmedName}」のおすすめポイントが見つかりませんでした。`,
          },
          404,
        );
      }
      return c.json({ highlights: result.highlights });
    }

    if (!result.description) {
      return c.json(
        {
          error: `${prefecture}${municipality}内で「${trimmedName}」の観光情報が見つかりませんでした。`,
        },
        404,
      );
    }

    return c.json({
      description: result.description,
      ...(result.category ? { category: result.category } : {}),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// スポット用スケッチ風イラスト生成（既定: テキストのみ / photo モード時は参考写真検索）
app.post("/v1/generate-spot-image", async (c) => {
  const { name, municipality, prefecture, address, referenceImage } = await c.req.json<{
    name: string;
    municipality: string;
    prefecture: string;
    address?: string;
    referenceImage?: { mimeType?: string; data?: string };
  }>();

  const trimmedName = name?.trim();
  if (!trimmedName || !municipality?.trim() || !prefecture?.trim()) {
    return c.json({ error: "name, municipality, prefecture は必須です" }, 400);
  }

  const uploadedReference =
    referenceImage?.data?.trim() && referenceImage?.mimeType?.trim()
      ? {
          mimeType: referenceImage.mimeType.trim(),
          data: referenceImage.data.trim(),
        }
      : undefined;

  try {
    console.info(
      `[spot-image] generate request: name="${trimmedName}" ${prefecture}${municipality}${uploadedReference ? " ref=upload" : ""}`,
    );
    const result = await generateSpotImage({
      name: trimmedName,
      municipality: municipality.trim(),
      prefecture: prefecture.trim(),
      address: address?.trim() || undefined,
      referenceImage: uploadedReference,
    });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[spot-image] generate failed:", msg);
    if (/429|quota|rate/i.test(msg)) {
      return c.json({ error: USER_BUSY_MESSAGE }, 429);
    }
    return c.json(
      { error: "画像の生成に失敗しました。しばらく待ってから再度お試しください。" },
      500,
    );
  }
});

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, port });
console.log(`agent listening on http://localhost:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
