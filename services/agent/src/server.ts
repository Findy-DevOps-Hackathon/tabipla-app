import { InMemoryRunner, stringifyContent } from "@google/adk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";


import { cors } from "hono/cors";
import { collectAgent, parseCollectResult } from "./agents/collect.js";


import { personalizedPlan } from "./agents/personalized.js";
import { recommendAgent } from "./agents/recommend.js";
import { ask } from "./agents/run.js";
import { KOMORO_SPOTS, SPOT_IMAGES, SPOT_TAGS } from "./fixtures/spots.js";
import { summarizeProfile, userProfiles } from "./personalize.js";
import { sceneSvg } from "./sceneSvg.js";
import { toolCallStorage } from "./tools/tracker.js";

const app = new Hono();

// admin-web(5174) からのクロスオリジン呼び出しを許可（ローカル開発用）
app.use("/v1/*", cors())

// スワイプUI(主役)。開発用パネルは /dev。
app.get("/", (c) => c.html(swipePageHtml));
app.get("/dev", (c) => c.html(pageHtml));

app.get("/healthz", (c) => c.json(
{
  ok: true;
}
))

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

// パーソナライズ: スワイプ→好み学習→推薦エージェントが「あなた向けのおすすめ」を返す
app.post("/v1/personalized/plan", async (c) =>
{
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
}
)

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
    theme = "",
    excludeNames = [],
  } = await c.req.json<{
    municipality: string;
    prefecture: string;
    targetCount?: number;
    /** 担当エリア内での絞り込みテーマ・観点（任意。例: 紅葉、神社仏閣、子連れ向け）。 */
    theme?: string;
    /** 既に登録済みのスポット名。収集結果から除外する。 */
    excludeNames?: string[];
  }>();
  if (!municipality || !prefecture) {
    return c.json({ error: "municipality と prefecture は必須です" }, 400);
  }

  try {
    const excludeBlock =
      excludeNames.length > 0
        ? `\n\n【除外リスト】以下のスポットは既に登録済みなので、出力に含めないこと:\n${excludeNames.map((n) => `- ${n}`).join("\n")}`
        : "";

    // テーマ指定があれば、その観点で担当エリア内を重点収集し、紹介文もその観点中心に書かせる
    // （無指定なら従来どおり満遍なく収集し、紹介文も一般的な観点で書く）。
    const focusBlock = theme.trim()
      ? `特に「${theme.trim()}」というテーマ・観点に合う観光地を重点的に集めてください。テーマに合わない場所は無理に含めないこと。
各スポットの紹介文（description）は、まず「それが何か」を一言で示したうえで、「${theme.trim()}」の観点での見どころ（例えば見頃の時期・種類・眺め方・具体的な特徴など）を中心に構成してください。ただし検索結果で実際に確認できた事実だけを使い、創作・誇張はしないこと。テーマに関する情報が見つからないスポットは、無理にそのテーマで書かず除外してください。`
      : "カテゴリ（観光・自然・歴史）をバランスよく、有名観光地だけでなく穴場も集めてください。";

    const prompt = `${prefecture}${municipality}の観光地を${targetCount}件を目標に収集してください。
${focusBlock}${excludeBlock}`;

    // 収集は数分に及ぶ長時間リクエストのため、ネットワーク瞬断などの一過性エラーは自動リトライする。
    const MAX_ATTEMPTS = 3;
    let final = "";
    let errMsg = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await runCollectOnce(prompt);
      final = res.final;
      errMsg = res.errMsg;
      if (final) break; // 成功
      if (!isTransientError(errMsg)) break; // リトライ不可なエラー
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
    // プロンプトの除外指示が無視された場合の保険（出口側でも機械的に除外）
    const excludeSet = new Set(excludeNames.map(normalizeSpotName));
    const spots = result.spots.filter((s) => !excludeSet.has(normalizeSpotName(s.name)));
    return c.json({
      municipality,
      prefecture,
      count: spots.length,
      spots,
    });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(
  `agent listening on http://localhost:${port}  (USE_MOCK=${process.env.USE_MOCK ?? "1"})`,
);
