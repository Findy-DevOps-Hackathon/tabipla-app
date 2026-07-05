import { InMemoryRunner, LlmAgent, stringifyContent } from "@google/adk";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { z } from "zod";
import { CHAT_MODEL } from "../modelConfig.js";

const SPOT_IMAGE_WIDTH = 1600;
const SPOT_IMAGE_HEIGHT = 1100;
const SPOT_IMAGE_MIME = "image/webp";

/** 管理画面・user-web ヒーローと同じ 16:11。 */
export const SPOT_IMAGE_ASPECT = "16:11";

export type SpotImageInput = {
  name: string;
  prefecture: string;
  municipality: string;
  description?: string;
  highlights?: string[];
  category?: string | string[];
  tags?: string[];
};

export type SpotImageResult = {
  mimeType: string;
  data: string;
  prompt: string;
};

const imageBriefSchema = z.object({
  landmark: z.string().min(1).max(100),
  visualElements: z.string().min(1).max(200),
  setting: z.string().min(1).max(150),
  /** Imagen へ渡す英語プロンプト（日本語文字禁止・画像内テキスト描画指示禁止）。 */
  imagenPrompt: z.string().min(40).max(480),
});

type ImageBrief = z.infer<typeof imageBriefSchema>;

/** Imagen 向けの文字排除サフィックス（英語のみ）。 */
const NO_TEXT_SUFFIX_EN =
  "Wordless illustration only. Zero text anywhere: no letters, numbers, kanji, hiragana, katakana, romaji, signage, posters, banners, logos, captions, labels, menus, maps, watermarks, or typography. Blank plain surfaces only.";

/** 入力にない要素の創作・推測を禁止する忠実性サフィックス。 */
const FIDELITY_SUFFIX_EN =
  "Depict only real features explicitly supported by the provided spot description, highlights, and tags. Do not invent, guess, embellish, or substitute landmarks, buildings, monuments, terrain, vegetation, food, or cultural elements that are not stated. Stay faithful to the actual place; avoid generic, fictional, or misleading tourist imagery.";

/**
 * 参考画像に合わせた水彩スケッチブック風スタイル（Imagen プロンプトに常に付与）。
 * 穏やかな海岸スケッチのような: 細いインク線、淡い水彩、パステル調、紙の質感、広い空。
 */
const SKETCHBOOK_STYLE_EN = [
  "Serene Japanese travel sketchbook watercolor illustration on textured cream paper.",
  "Delicate fine ink and pencil outlines with soft transparent watercolor washes and light colored pencil touches.",
  "Muted pastel palette: pale blue sky, sandy beige, soft grey, earthy tan, natural pine green, gentle turquoise water tones.",
  "Soft diffused daylight like an overcast day, calm peaceful atmosphere, no harsh shadows, no bold saturated colors.",
  "Airy open composition with a wide pale sky, generous negative space, low horizon, hand-drawn imperfect lines.",
  "Slightly simplified but recognizably faithful forms based on the provided factual description, charming and intimate, not photorealistic, not a photograph, not 3D CGI, not anime.",
  "Optional tiny distant human figures for scale only, no facial detail.",
].join(" ");

const spotImageBriefAgent = new LlmAgent({
  name: "spot_image_brief_agent",
  model: CHAT_MODEL,
  description: "観光スポットイラスト用の描画指示を抽出する",
  instruction: `あなたは観光イラストの描画指示を作るアシスタントです。
入力された観光スポットについて JSON を返します。

【最重要: 事実に基づく描写】
- 入力の紹介文・おすすめポイント・タグに書かれた内容**だけ**を描く
- 入力にない建物・名所・地形・シンボル・料理・文化要素は**追加しない**
- 推測・創作・一般化で補完しない（別の観光地風の汎用風景も禁止）
- 不明な部分は省略する。嘘や誇張で埋めない

【参考スタイル（Imagen 側で自動付与するため imagenPrompt に書かない）】
穏やかな日本の旅行スケッチブック風水彩。細いインク線、淡い透明水彩、色鉛筆、パステル調、紙の質感、広い空、柔らかい光。

【ルール】
- landmark: スポットの正式名称（入力 name をそのまま・日本語可）
- visualElements: **入力に根拠のある**具体物を日本語で3〜5個（読点区切り）。看板・標識は含めない
- setting: 場所と雰囲気（日本語1文）。入力の説明から導ける範囲のみ
- imagenPrompt: Imagen 用の**被写体描写のみ**（英語・220字以内）
  - **日本語文字（漢字・ひらがな・カタカナ）を一切含めない**
  - スポット名を画像内に描く・綴る指示をしない（名前の文字列をプロンプトに書かない）
  - 場所は英語表記（例: Komoro City, Nagano Prefecture, Japan）
  - 見た目だけ: 入力で言及された建物の形、門、石垣、滝、庭園、樹木、食べ物など**固有物のみ**
  - スタイル・画材・「no text」・忠実性の注意書きは書かない（サーバーが付与する）
  - 例: "Historic castle gate and mossy stone walls in a hillside park, pine trees and cherry blossoms. Komoro City, Nagano Prefecture, Japan."
- 入力にない別スポット・別地域の要素は追加しない`,
  outputSchema: imageBriefSchema,
  generateContentConfig: {
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: 1024,
  },
});

const CATEGORY_VISUALS: Record<string, string> = {
  自然: "周囲の自然",
  "歴史・文化": "歴史的建造物の外観",
  都市: "施設の外観",
  芸術: "美術館・展示空間",
  食: "名物料理や店の外観",
  "レジャー・スポーツ": "施設の外観",
  イベント: "催しの装飾",
  ショッピング: "店舗の外観",
};

function normalizeCategory(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  const items = (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean);
  return items[0];
}

/** ヒューリスティックな描画指示（LLM 失敗時のフォールバック）。 */
export function buildVisualSubjects(input: SpotImageInput): string {
  const name = input.name.trim();
  const parts: string[] = [name];

  for (const highlight of (input.highlights ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3)) {
    if (!parts.includes(highlight)) parts.push(highlight);
  }

  for (const tag of (input.tags ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 2)) {
    if (!parts.includes(tag)) parts.push(tag);
  }

  const description = input.description?.trim();
  if (description) {
    const firstSentence = description.split(/[。．.!?\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length <= 80 && !parts.includes(firstSentence)) {
      parts.push(firstSentence);
    }
  }

  if (parts.length < 3) {
    const category = normalizeCategory(input.category);
    const hint = category ? CATEGORY_VISUALS[category] : undefined;
    if (hint && !parts.includes(hint)) parts.push(hint);
  }

  return parts.join("、");
}

/** Imagen プロンプトに日本語地名を渡すと文字として描画されやすいため英語に変換。 */
function englishPlaceLabel(prefecture: string, municipality: string): string {
  const pairs: Record<string, string> = {
    長野県小諸市: "Komoro City, Nagano Prefecture, Japan",
    長野県: "Nagano Prefecture, Japan",
  };
  return pairs[`${prefecture}${municipality}`] ?? pairs[prefecture] ?? "Japan";
}

const CATEGORY_VISUALS_EN: Record<string, string> = {
  自然: "natural scenery, trees, mountains, water",
  "歴史・文化": "historic gate, stone walls, castle ruins, traditional architecture",
  都市: "townscape, public building, plaza",
  芸術: "art museum exterior, gallery space",
  食: "local specialty food still life, market stall without labels",
  "レジャー・スポーツ": "outdoor leisure facility, open field",
  イベント: "festival decorations without writing",
  ショッピング: "shopping street facades with blank signboards",
};

function buildEnglishSubject(input: SpotImageInput, brief?: Partial<ImageBrief>): string {
  const place = englishPlaceLabel(input.prefecture, input.municipality);
  const category = normalizeCategory(input.category);
  const visualEn =
    brief?.visualElements && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(brief.visualElements)
      ? brief.visualElements
      : (category ? CATEGORY_VISUALS_EN[category] : undefined) ??
        "distinctive local tourist landmark and surroundings";

  return `Depict this specific place in ${place}, showing ${visualEn}.`;
}

function assembleImagenPrompt(subject: string): string {
  return ensureNoTextSuffix(
    `${SKETCHBOOK_STYLE_EN} ${subject.trim()} ${FIDELITY_SUFFIX_EN}`,
  );
}

function ensureNoTextSuffix(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("no text") && lower.includes("wordless")) return prompt.trim();
  return `${prompt.trim()} ${NO_TEXT_SUFFIX_EN}`;
}

function heuristicBrief(input: SpotImageInput): ImageBrief {
  const landmark = input.name.trim();
  const visualElements = buildVisualSubjects(input);
  const setting = `${input.prefecture}${input.municipality}にある「${landmark}」の風景として描く`;
  return {
    landmark,
    visualElements,
    setting,
    imagenPrompt: buildEnglishSubject(input),
  };
}

function buildBriefPrompt(input: SpotImageInput): string {
  const category = normalizeCategory(input.category) ?? "不明";
  const highlights = (input.highlights ?? []).filter(Boolean).join(" / ") || "なし";
  const tags = (input.tags ?? []).filter(Boolean).join("、") || "なし";
  return `スポット名: ${input.name.trim()}
所在地: ${input.prefecture}${input.municipality}
カテゴリ: ${category}
紹介文: ${input.description?.trim() || "なし"}
おすすめポイント: ${highlights}
タグ: ${tags}`;
}

async function runBriefAgentOnce(prompt: string): Promise<string> {
  const runner = new InMemoryRunner({ agent: spotImageBriefAgent });
  const session = await runner.sessionService.createSession({
    appName: runner.appName,
    userId: "admin",
  });

  let final = "";
  for await (const event of runner.runAsync({
    userId: "admin",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: prompt }] },
  })) {
    const t = stringifyContent(event).trim();
    if (t) final = t;
  }
  return final;
}

async function resolveImageBrief(input: SpotImageInput): Promise<ImageBrief> {
  try {
    const final = await runBriefAgentOnce(buildBriefPrompt(input));
    if (!final) return heuristicBrief(input);
    const parsed = imageBriefSchema.safeParse(JSON.parse(final));
    if (parsed.success) {
      return {
        ...parsed.data,
        landmark: input.name.trim() || parsed.data.landmark,
        imagenPrompt: parsed.data.imagenPrompt.trim(),
      };
    }
  } catch {
    // fall through
  }
  return heuristicBrief(input);
}

/** Imagen 向けプロンプト（英語のみ・参考水彩スケッチスタイル付き）。 */
export function buildSpotImagePrompt(_input: SpotImageInput, brief: ImageBrief): string {
  return assembleImagenPrompt(brief.imagenPrompt);
}

function getGenAiClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const location =
    process.env.SPOT_IMAGE_LOCATION?.trim() ||
    process.env.GOOGLE_CLOUD_LOCATION?.trim() ||
    "asia-northeast1";
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT が未設定です。");
  }
  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });
}

function getImageModel(): string {
  return process.env.SPOT_IMAGE_MODEL?.trim() || "imagen-3.0-generate-001";
}

const SPOT_IMAGE_NEGATIVE_PROMPT =
  "text, letters, words, numbers, typography, captions, labels, signage, signboard, poster, banner, logo, watermark, kanji, hiragana, katakana, writing, menu, map, book, newspaper, speech bubble, subtitle, invented landmark, fictional architecture, wrong building, fantasy castle, generic scenery, unrelated location, made-up monument, inaccurate representation, misleading tourist postcard, photorealistic, hyperrealistic, 3d render, cgi, anime, manga, bold saturated colors, harsh shadows, dark moody, oil painting, digital art";

/** 創作を防ぐため、紹介文またはおすすめポイントが十分あるか確認する。 */
export function hasFactualImageBasis(input: SpotImageInput): boolean {
  const description = input.description?.trim() ?? "";
  if (description.length >= 20) return true;
  return (input.highlights ?? []).some((item) => item.trim().length >= 5);
}

async function cropToSpotAspect(imageBytes: Buffer): Promise<Buffer> {
  return sharp(imageBytes)
    .resize(SPOT_IMAGE_WIDTH, SPOT_IMAGE_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();
}

async function generateLiveSpotImage(
  input: SpotImageInput,
  brief: ImageBrief,
): Promise<SpotImageResult> {
  const prompt = buildSpotImagePrompt(input, brief);
  const ai = getGenAiClient();
  const response = await ai.models.generateImages({
    model: getImageModel(),
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "16:9",
      // imagen-3.0-generate-001 は negativePrompt 対応。未対応モデルでは無視される。
      negativePrompt: SPOT_IMAGE_NEGATIVE_PROMPT,
      enhancePrompt: false,
    } as Parameters<GoogleGenAI["models"]["generateImages"]>[0]["config"],
  });

  const rawBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!rawBytes) {
    throw new Error("画像生成モデルから画像が返りませんでした");
  }

  const source =
    typeof rawBytes === "string" ? Buffer.from(rawBytes, "base64") : Buffer.from(rawBytes);
  const buffer = await cropToSpotAspect(source);
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("生成画像が 5MB を超えました");
  }

  return {
    mimeType: SPOT_IMAGE_MIME,
    data: buffer.toString("base64"),
    prompt,
  };
}

/** スポット用スケッチ風イラストを生成する（16:11 WebP）。 */
export async function generateSpotImage(input: SpotImageInput): Promise<SpotImageResult> {
  const name = input.name?.trim();
  if (!name || !input.prefecture?.trim() || !input.municipality?.trim()) {
    throw new Error("name, prefecture, municipality は必須です");
  }
  if (!hasFactualImageBasis(input)) {
    throw new Error(
      "正確なイラストを生成するため、紹介文（20字以上）またはおすすめポイントを入力してから生成してください。",
    );
  }

  // 旧モック（汎用 SVG）はスポットと無関係なため廃止。Imagen のみ使用。
  const brief = await resolveImageBrief(input);

  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateLiveSpotImage(input, brief);
      console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
