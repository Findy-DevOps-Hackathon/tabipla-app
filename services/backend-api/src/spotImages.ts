import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** スポット画像の保存先（環境変数 UPLOAD_DIR で上書き可）。 */
export function getSpotUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads", "spots");
}

/** DB / API に保存する公開パス。 */
export function spotImagePublicPath(spotId: string, ext: string): string {
  return `/uploads/spots/${spotId}.${ext}`;
}

export function mimeTypeForFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

/** 同一スポット ID の旧画像ファイルを削除する。 */
async function removeExistingSpotImages(spotId: string, uploadDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(uploadDir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith(`${spotId}.`))
      .map((name) => unlink(join(uploadDir, name)).catch(() => undefined)),
  );
}

/** Base64 画像を保存し、公開 URL パスを返す。 */
export async function saveSpotImage(
  spotId: string,
  mimeType: string,
  base64Data: string,
): Promise<string> {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw new Error("JPEG / PNG / WebP のみアップロードできます。");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) {
    throw new Error("画像データが空です。");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("画像サイズは 5MB 以下にしてください。");
  }

  const uploadDir = getSpotUploadDir();
  await mkdir(uploadDir, { recursive: true });
  await removeExistingSpotImages(spotId, uploadDir);

  const filename = `${spotId}.${ext}`;
  await writeFile(join(uploadDir, filename), buffer);
  return spotImagePublicPath(spotId, ext);
}

/** スポット画像ファイルを読み込む。 */
export async function readSpotImageFile(
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!/^[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/.test(filename)) {
    return null;
  }
  const mimeType = mimeTypeForFilename(filename);
  if (!mimeType) return null;

  try {
    const buffer = await readFile(join(getSpotUploadDir(), filename));
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

/** スポットに紐づく画像ファイルを削除する。 */
export async function deleteSpotImageFiles(spotId: string): Promise<void> {
  await removeExistingSpotImages(spotId, getSpotUploadDir());
}
