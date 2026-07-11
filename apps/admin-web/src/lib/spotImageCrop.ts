/** user-web ヒーロー・agent 生成画像と同じ 16:11。 */
export const SPOT_IMAGE_ASPECT = 16 / 11;
export const SPOT_IMAGE_OUTPUT_WIDTH = 1600;
export const SPOT_IMAGE_OUTPUT_HEIGHT = 1100;

export const SPOT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const SPOT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** agent / seed 変換と同じ品質。 */
export const SPOT_IMAGE_OUTPUT_MIME = "image/webp";
export const SPOT_IMAGE_WEBP_QUALITY = 0.85;

type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function validateSpotImageFile(file: File): string | null {
  if (!SPOT_IMAGE_ACCEPT.split(",").includes(file.type)) {
    return "JPEG / PNG / WebP のみアップロードできます。";
  }
  if (file.size > SPOT_IMAGE_MAX_BYTES) {
    return "画像サイズは 5MB 以下にしてください。";
  }
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("画像の読み込みに失敗しました")));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const quality =
      mimeType === SPOT_IMAGE_OUTPUT_MIME
        ? SPOT_IMAGE_WEBP_QUALITY
        : mimeType === "image/jpeg"
          ? 0.92
          : undefined;
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の加工に失敗しました"));
      },
      mimeType,
      quality,
    );
  });
}

function spotImageOutputFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "spot";
  return `${baseName}.webp`;
}

/** 任意のスポット画像 File を WebP に変換する（既に WebP の場合はそのまま返す）。 */
export async function convertSpotImageFileToWebp(file: File): Promise<File> {
  const validationError = validateSpotImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }
  if (file.type === SPOT_IMAGE_OUTPUT_MIME) {
    return file;
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像の加工に失敗しました");

    ctx.drawImage(image, 0, 0);
    const blob = await canvasToBlob(canvas, SPOT_IMAGE_OUTPUT_MIME);

    if (blob.size > SPOT_IMAGE_MAX_BYTES) {
      throw new Error("加工後の画像サイズが 5MB を超えています。別の写真をお試しください。");
    }

    return new File([blob], spotImageOutputFileName(file.name), { type: SPOT_IMAGE_OUTPUT_MIME });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** クロップ・リサイズ済みのスポット画像 File を生成する。 */
export async function cropSpotImageFile(
  imageSrc: string,
  pixelCrop: PixelCrop,
  _mimeType: string,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = SPOT_IMAGE_OUTPUT_WIDTH;
  canvas.height = SPOT_IMAGE_OUTPUT_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の加工に失敗しました");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    SPOT_IMAGE_OUTPUT_WIDTH,
    SPOT_IMAGE_OUTPUT_HEIGHT,
  );

  const blob = await canvasToBlob(canvas, SPOT_IMAGE_OUTPUT_MIME);

  if (blob.size > SPOT_IMAGE_MAX_BYTES) {
    throw new Error("加工後の画像サイズが 5MB を超えています。別の写真をお試しください。");
  }

  return new File([blob], spotImageOutputFileName(fileName), { type: SPOT_IMAGE_OUTPUT_MIME });
}
