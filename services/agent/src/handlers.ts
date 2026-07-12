import { InMemoryRunner, type LlmAgent, stringifyContent } from "@google/adk";
import {
  COLLECT_CATEGORIES,
  collectAgent,
  MAX_COLLECT_TARGET_COUNT,
  resolveCollectResult,
} from "./agents/collect.js";
import { type DescribeMode, describeAgent, describeSpot } from "./agents/describe.js";
import { askIntroduce } from "./agents/introduce.js";
import { personalizedPlan } from "./agents/personalized.js";
import { generateSpotImage } from "./agents/spotImage.js";
import type { Spot } from "./contracts.js";

export const USER_BUSY_MESSAGE = "ただいま混み合っています。1分ほど待ってから再度お試しください。";
export const USER_QUOTA_MESSAGE =
  "Gemini API の利用上限に達しました。1時間ほど待つか、Google AI Studio で課金設定を確認してください。";
export const SPOT_IMAGE_QUOTA_MESSAGE =
  "画像生成の利用上限に達しました。1分ほど待ってから再度お試しください。続く場合は GCP コンソールの Vertex AI クォータを確認してください。";
export const USER_GENERIC_ERROR_MESSAGE =
  "うまく処理できませんでした。しばらく待ってから再度お試しください。";

export class AgentHandlerError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentHandlerError";
  }
}

/** モデル/API 失敗をユーザー向け文言に整える（技術詳細はサーバーログのみ）。 */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[agent] request failed:", msg);
  if (/429|quota|exceeded your current quota|rate.?limit/i.test(msg)) {
    return USER_QUOTA_MESSAGE;
  }
  if (/503|overloaded|capacity|混雑/i.test(msg)) {
    return USER_BUSY_MESSAGE;
  }
  return USER_GENERIC_ERROR_MESSAGE;
}

function normalizeSpotName(name: string): string {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
}

function isTransientError(msg: string): boolean {
  return /fetch failed|UNKNOWN_ERROR|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|network|50[234]/i.test(
    msg,
  );
}

export async function runAgentOnce(
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

export type PersonalizedPlanInput = {
  likes?: string[];
  nopes?: string[];
  likeWeights?: Record<string, number>;
  travelMemory?: string;
  catalog?: Spot[];
  page?: number;
  limit?: number;
  planKey?: string;
};

export async function handlePersonalizedPlan(input: PersonalizedPlanInput) {
  const {
    likes = [],
    nopes = [],
    likeWeights,
    travelMemory = "",
    catalog,
    page,
    limit,
    planKey,
  } = input;
  if (!catalog || catalog.length === 0) {
    throw new AgentHandlerError("catalog は必須です", 400, { error: "catalog は必須です" });
  }
  try {
    return await personalizedPlan({ likes, nopes, likeWeights }, travelMemory, catalog, {
      page,
      limit,
      planKey,
    });
  } catch (e) {
    console.error(e);
    throw new AgentHandlerError(friendlyError(e), 500, { error: friendlyError(e) });
  }
}

export type AskSpotInput = {
  spotId: string;
  text?: string;
  image?: { mimeType: string; data: string };
  audio?: { mimeType: string; data: string };
  userProfileSummary?: string;
  spot?: {
    name: string;
    description?: string;
    highlights?: string[];
    area?: string;
    prefecture?: string;
    address?: string;
  };
  facts?: string[];
};

export async function handleAskSpot(input: AskSpotInput) {
  const { spotId, text, image, audio, spot, facts, userProfileSummary } = input;
  try {
    const answer = await askIntroduce(
      {
        spotId,
        text,
        image,
        audio,
        introStyle: "",
        userProfileSummary: userProfileSummary ?? "",
        spot,
        facts,
      },
      spotId,
    );
    return { answer };
  } catch (e) {
    console.error(e);
    return { answer: friendlyError(e) };
  }
}

export type CollectSpotsInput = {
  municipality: string;
  prefecture: string;
  targetCount?: number;
  categories?: string[];
  excludeNames?: string[];
};

export async function handleCollectSpots(input: CollectSpotsInput) {
  const {
    municipality,
    prefecture,
    targetCount = MAX_COLLECT_TARGET_COUNT,
    categories = [],
    excludeNames = [],
  } = input;
  if (!municipality || !prefecture) {
    throw new AgentHandlerError("municipality と prefecture は必須です", 400, {
      error: "municipality と prefecture は必須です",
    });
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new AgentHandlerError("categories は1件以上必須です", 400, {
      error: "categories は1件以上必須です",
    });
  }
  const allowed = new Set<string>(COLLECT_CATEGORIES);
  const invalid = categories.filter((cat) => !allowed.has(cat));
  if (invalid.length > 0) {
    throw new AgentHandlerError(`不正なカテゴリ: ${invalid.join(", ")}`, 400, {
      error: `不正なカテゴリ: ${invalid.join(", ")}`,
    });
  }
  const effectiveTargetCount = Math.min(
    MAX_COLLECT_TARGET_COUNT,
    Math.max(1, Math.floor(Number(targetCount) || MAX_COLLECT_TARGET_COUNT)),
  );

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
    throw new AgentHandlerError(message, 500, { error: message });
  }

  const result = await resolveCollectResult(final, { prefecture, municipality }, runAgentOnce);
  const excludeSet = new Set(excludeNames.map(normalizeSpotName));
  const spots = result.spots
    .filter((s) => !excludeSet.has(normalizeSpotName(s.name)))
    .slice(0, effectiveTargetCount);
  return {
    municipality,
    prefecture,
    count: spots.length,
    spots,
  };
}

export type DescribeSpotInput = {
  name: string;
  municipality: string;
  prefecture: string;
  address?: string;
  mode?: DescribeMode;
};

export async function handleDescribeSpot(input: DescribeSpotInput) {
  const { name, municipality, prefecture, address, mode = "description" } = input;
  const trimmedName = name?.trim();
  if (!trimmedName || !municipality || !prefecture) {
    throw new AgentHandlerError("name, municipality, prefecture は必須です", 400, {
      error: "name, municipality, prefecture は必須です",
    });
  }
  if (mode !== "description" && mode !== "highlights") {
    throw new AgentHandlerError("mode は description または highlights を指定してください", 400, {
      error: "mode は description または highlights を指定してください",
    });
  }

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
    throw new AgentHandlerError(message, 500, { error: message });
  }

  if (mode === "highlights") {
    if (result.highlights.length === 0) {
      throw new AgentHandlerError(
        `${prefecture}${municipality}内で「${trimmedName}」のおすすめポイントが見つかりませんでした。`,
        404,
        {
          error: `${prefecture}${municipality}内で「${trimmedName}」のおすすめポイントが見つかりませんでした。`,
        },
      );
    }
    return { highlights: result.highlights };
  }

  if (!result.description) {
    throw new AgentHandlerError(
      `${prefecture}${municipality}内で「${trimmedName}」の観光情報が見つかりませんでした。`,
      404,
      {
        error: `${prefecture}${municipality}内で「${trimmedName}」の観光情報が見つかりませんでした。`,
      },
    );
  }

  return {
    description: result.description,
    ...(result.category ? { category: result.category } : {}),
  };
}

export type GenerateSpotImageInput = {
  name: string;
  municipality: string;
  prefecture: string;
  address?: string;
  referenceImage?: { mimeType?: string; data?: string };
};

export async function handleGenerateSpotImage(input: GenerateSpotImageInput) {
  const { name, municipality, prefecture, address, referenceImage } = input;
  const trimmedName = name?.trim();
  if (!trimmedName || !municipality?.trim() || !prefecture?.trim()) {
    throw new AgentHandlerError("name, municipality, prefecture は必須です", 400, {
      error: "name, municipality, prefecture は必須です",
    });
  }

  const uploadedReference =
    referenceImage?.data?.trim() && referenceImage?.mimeType?.trim()
      ? {
          mimeType: referenceImage.mimeType.trim(),
          data: referenceImage.data.trim(),
        }
      : undefined;

  console.info(
    `[spot-image] generate request: name="${trimmedName}" ${prefecture}${municipality}${uploadedReference ? " ref=upload" : ""}`,
  );
  try {
    return await generateSpotImage({
      name: trimmedName,
      municipality: municipality.trim(),
      prefecture: prefecture.trim(),
      address: address?.trim() || undefined,
      referenceImage: uploadedReference,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[spot-image] generate failed:", msg);
    if (/429|quota|rate|RESOURCE_EXHAUSTED/i.test(msg)) {
      throw new AgentHandlerError(SPOT_IMAGE_QUOTA_MESSAGE, 429, {
        error: SPOT_IMAGE_QUOTA_MESSAGE,
      });
    }
    throw new AgentHandlerError(
      "画像の生成に失敗しました。しばらく待ってから再度お試しください。",
      500,
      { error: "画像の生成に失敗しました。しばらく待ってから再度お試しください。" },
    );
  }
}
