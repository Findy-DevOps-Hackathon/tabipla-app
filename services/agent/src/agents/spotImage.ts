import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";
import { findReferencePhoto, tryFindReferencePhoto } from "./spotReferencePhoto.js";
import {
  formatVisualBriefForPrompt,
  researchSpotVisualBrief,
  type SpotVisualBrief,
} from "./spotVisualBrief.js";

const SPOT_IMAGE_WIDTH = 1600;
const SPOT_IMAGE_HEIGHT = 1100;
const SPOT_IMAGE_MIME = "image/webp";

/** 管理画面・user-web ヒーローと同じ 16:11。 */
export const SPOT_IMAGE_ASPECT = "16:11";

export type SpotImageInput = {
  name: string;
  prefecture: string;
  municipality: string;
  address?: string;
  /** 管理画面からアップロードされた参考写真（base64）。指定時は Web 検索を使わずイラスト化する。 */
  referenceImage?: {
    mimeType: string;
    data: string;
  };
};

export type SpotImageResult = {
  mimeType: string;
  data: string;
  prompt: string;
  referencePhotoUrl?: string;
};

export type SpotImageReferenceMode = "auto" | "text-only" | "photo";

function spotLocationLabel(prefecture: string, municipality: string): string {
  return `${prefecture.trim()}${municipality.trim()}`;
}

/** 文字・看板・標識を一切描かない旨（最重要）。 */
const NO_TEXT_RULES = [
  "【最重要・文字禁止】画像内に一切の文字を描かないこと。",
  "看板、標識、ポスター、のぼり、メニュー、地図、案内板、店名、ロゴ、キャプション、水印、タイポグラフィはすべて禁止。",
  "漢字・ひらがな・カタカナ・アルファベット・数字・記号も一切禁止。",
  "文字が写り込みそうな場所（看板、扉、ポスター、垂れ幕など）は空白の面、無地、または抽象的な模様に置き換える。",
  "文字のないイラストのみを出力する。",
].join("\n");

/** スケッチブック風の描き方・トーン指定（スポット名・調査結果は含めない）。 */
function buildSketchBookStyleOnly(): string {
  return [
    "細めの手描きインク線、少しかすれた線、透明水彩と色鉛筆による着彩。",
    "完全に写実的にはせず、形を少し単純化する。",
    "落ち着いた温かい色合い、紙の質感、ゆったりした余白。",
    "旅先で偶然見つけた風景を記録したような親しみのある雰囲気。",
    "人物を入れる場合は小さく、顔の詳細は描き込まない。",
    "観光パンフレット、写真、3DCG、過度にリアルな表現にはしない。",
    "横長のWebサイト用イラスト。",
    NO_TEXT_RULES,
  ].join("\n");
}

/** 旅行スケッチブック風イラストの共通プロンプト本文（テキストのみ生成向け）。 */
function buildSketchBookPromptBody(
  spot: string,
  location: string,
  brief: SpotVisualBrief | null,
  wikipediaIntro: string | null,
): string {
  const subjectLine = brief?.subject
    ? `${spot}（${location}）を主役にし、主役は「${brief.subject}」とする。`
    : `${spot}（${location}）を主役にし、特徴的な建物・自然・名物を描く。`;

  const elementsLine =
    brief && brief.keyElements.length > 0
      ? `次の要素を必ず含める（省略禁止）: ${brief.keyElements.join("、")}。`
      : "";

  const compositionLine = brief?.composition ? `構図指示（厳守）: ${brief.composition}。` : "";

  const atmosphereLine = brief?.atmosphere ? `雰囲気（厳守）: ${brief.atmosphere}。` : "";

  const avoidLine =
    brief && brief.avoidElements.length > 0
      ? `【禁止】次は絶対に描かない: ${brief.avoidElements.join("、")}。`
      : "";

  const briefBlock = formatVisualBriefForPrompt(brief, wikipediaIntro);

  return [
    "日本の旅行スケッチブックに描かれたような観光イラスト。",
    subjectLine,
    elementsLine,
    compositionLine,
    atmosphereLine,
    avoidLine,
    buildSketchBookStyleOnly(),
    briefBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

function getSpotImageReferenceMode(): SpotImageReferenceMode {
  const mode = process.env.SPOT_IMAGE_REFERENCE_MODE?.trim().toLowerCase();
  if (mode === "photo") return "photo";
  if (mode === "text-only") return "text-only";
  return "auto";
}

/** テキストのみ生成向けプロンプト。 */
export function buildTextOnlyPrompt(
  input: SpotImageInput,
  brief: SpotVisualBrief | null = null,
  wikipediaIntro: string | null = null,
): string {
  const spot = input.name.trim();
  const location = spotLocationLabel(input.prefecture, input.municipality);
  const addressLine = input.address?.trim() ? `\n住所: ${input.address.trim()}` : "";
  return `${buildSketchBookPromptBody(spot, location, brief, wikipediaIntro)}${addressLine}\n\n${spot}の観光イラストを作成して`;
}

/** 参考写真ベース生成向けプロンプト（写真の内容だけをスタイル変換する）。 */
export function buildStylizePrompt(): string {
  return [
    "添付した参考写真をもとに、以下のスタイルでイラスト化してください。",
    "参考写真の構図・建物・地形・木々・空の配置は維持し、描き方だけ変えてください。",
    "参考写真にない建物や物体は追加しないでください。",
    "参考写真に写っている看板・文字・標識はすべて除去し、無地の面に置き換えてください。",
    "スポット名・地名・説明文などのテキスト情報は無視し、写真の内容だけを忠実にイラスト化してください。",
    "",
    "日本の旅行スケッチブックに描かれたようなイラスト。",
    buildSketchBookStyleOnly(),
    "",
    "参考写真をスケッチブック風イラストに変換して",
  ].join("\n");
}

function getSpotImageLocation(): string {
  return process.env.SPOT_IMAGE_LOCATION?.trim() || "global";
}

function getGenAiClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT が未設定です。");
  }
  return new GoogleGenAI({ vertexai: true, project, location: getSpotImageLocation() });
}

function getSpotImageModel(): string {
  return process.env.SPOT_IMAGE_MODEL?.trim() || "gemini-3-pro-image";
}

async function cropToSpotAspect(imageBytes: Buffer): Promise<Buffer> {
  return sharp(imageBytes)
    .resize(SPOT_IMAGE_WIDTH, SPOT_IMAGE_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();
}

async function prepareReferenceForSketch(reference: Buffer): Promise<Buffer> {
  return sharp(reference)
    .modulate({ saturation: 0.9, brightness: 1.02 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

const UPLOAD_REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_REFERENCE_MIN_BYTES = 8_000;

function parseUploadedReference(referenceImage: { mimeType: string; data: string }): {
  buffer: Buffer;
  mimeType: string;
  sourceUrl: string;
} {
  const mimeType = referenceImage.mimeType.trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
    throw new Error("referenceImage.mimeType は image/jpeg / image/png / image/webp のみ対応です");
  }

  const data = referenceImage.data.trim();
  if (!data) {
    throw new Error("referenceImage.data が空です");
  }

  const buffer = Buffer.from(data, "base64");
  if (buffer.length < UPLOAD_REFERENCE_MIN_BYTES || buffer.length > UPLOAD_REFERENCE_MAX_BYTES) {
    throw new Error("referenceImage のサイズが不正です（8KB〜8MB）");
  }

  return { buffer, mimeType, sourceUrl: "upload" };
}

async function generateFromGeminiContent(
  parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>,
  logContext: string,
): Promise<Omit<SpotImageResult, "prompt" | "referencePhotoUrl">> {
  const ai = getGenAiClient();
  const model = getSpotImageModel();

  console.info(
    `[spot-image] generateContent model=${model} location=${getSpotImageLocation()} ${logContext}`,
  );

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "2K",
      },
    },
  });

  const imageData = response.data;
  if (!imageData) {
    const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini 画像モデルから画像が返りませんでした (finishReason=${finishReason})`);
  }

  const rawBytes = Buffer.from(imageData, "base64");
  const buffer = await cropToSpotAspect(rawBytes);
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("生成画像が 5MB を超えました");
  }

  return {
    mimeType: SPOT_IMAGE_MIME,
    data: buffer.toString("base64"),
  };
}

async function generateTextOnlySpotImage(
  input: SpotImageInput,
  brief: SpotVisualBrief | null,
  wikipediaIntro: string | null,
): Promise<SpotImageResult> {
  const prompt = buildTextOnlyPrompt(input, brief, wikipediaIntro);
  const generated = await generateFromGeminiContent([{ text: prompt }], "mode=text-only");
  return { ...generated, prompt };
}

async function stylizeReferencePhoto(reference: {
  buffer: Buffer;
  mimeType: string;
  sourceUrl: string;
}): Promise<SpotImageResult> {
  const prompt = buildStylizePrompt();
  const preparedReference = await prepareReferenceForSketch(reference.buffer);

  const generated = await generateFromGeminiContent(
    [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: preparedReference.toString("base64"),
        },
      },
      { text: prompt },
    ],
    `mode=photo ref=${reference.sourceUrl}`,
  );

  return {
    ...generated,
    prompt,
    referencePhotoUrl: reference.sourceUrl,
  };
}

/** スポット用スケッチ風イラストを生成する（既定: auto → 調査 → 参考写真 or text-only）。 */
export async function generateSpotImage(input: SpotImageInput): Promise<SpotImageResult> {
  const name = input.name?.trim();
  if (!name || !input.prefecture?.trim() || !input.municipality?.trim()) {
    throw new Error("name, prefecture, municipality は必須です");
  }

  const mode = getSpotImageReferenceMode();
  const MAX_ATTEMPTS = 2;
  let lastError: unknown;

  const searchInput = {
    name,
    prefecture: input.prefecture.trim(),
    municipality: input.municipality.trim(),
    address: input.address?.trim() || undefined,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (input.referenceImage) {
        const reference = parseUploadedReference(input.referenceImage);
        const result = await stylizeReferencePhoto(reference);
        console.info(`[spot-image] ${name} model=${getSpotImageModel()} mode=upload`);
        console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
        return result;
      }

      if (mode === "text-only") {
        const { brief, wikipediaIntro } = await researchSpotVisualBrief(searchInput);
        const result = await generateTextOnlySpotImage(input, brief, wikipediaIntro);
        console.info(`[spot-image] ${name} model=${getSpotImageModel()} mode=text-only`);
        console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
        return result;
      }

      if (mode === "photo") {
        const reference = await findReferencePhoto(searchInput);
        const result = await stylizeReferencePhoto(reference);
        console.info(
          `[spot-image] ${name} model=${getSpotImageModel()} mode=photo ref=${reference.sourceUrl}`,
        );
        console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
        return result;
      }

      // auto: 参考写真が取れれば photo、なければ text-only（調査結果付き）
      const reference = await tryFindReferencePhoto(searchInput);
      if (reference) {
        const result = await stylizeReferencePhoto(reference);
        console.info(
          `[spot-image] ${name} model=${getSpotImageModel()} mode=auto→photo ref=${reference.sourceUrl}`,
        );
        console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
        return result;
      }

      console.info(`[spot-image] ${name} mode=auto→text-only (no reference photo)`);
      const { brief, wikipediaIntro } = await researchSpotVisualBrief(searchInput);
      const result = await generateTextOnlySpotImage(input, brief, wikipediaIntro);
      console.info(`[spot-image] ${name} model=${getSpotImageModel()} mode=auto→text-only`);
      console.info(`[spot-image] ${name} prompt: ${result.prompt.slice(0, 240)}…`);
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[spot-image] ${name} mode=${mode} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
