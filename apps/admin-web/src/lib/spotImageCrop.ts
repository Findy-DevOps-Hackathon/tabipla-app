import { SPOT_IMAGE_ACCEPT, SPOT_IMAGE_MAX_BYTES } from "../api.ts";

/** user-web ヒーロー・agent 生成画像と同じ 16:11。 */
export const SPOT_IMAGE_ASPECT = 16 / 11;
export const SPOT_IMAGE_OUTPUT_WIDTH = 1600;
export const SPOT_IMAGE_OUTPUT_HEIGHT = 1100;

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
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の加工に失敗しました"));
      },
      mimeType,
      mimeType === "image/png" ? undefined : 0.92,
    );
  });
}

/** クロップ・リサイズ済みのスポット画像 File を生成する。 */
export async function cropSpotImageFile(
  imageSrc: string,
  pixelCrop: PixelCrop,
  mimeType: string,
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

  const outputMime = SPOT_IMAGE_ACCEPT.split(",").includes(mimeType) ? mimeType : "image/jpeg";
  const blob = await canvasToBlob(canvas, outputMime);

  if (blob.size > SPOT_IMAGE_MAX_BYTES) {
    throw new Error("加工後の画像サイズが 5MB を超えています。別の写真をお試しください。");
  }

  return new File([blob], fileName, { type: outputMime });
}
