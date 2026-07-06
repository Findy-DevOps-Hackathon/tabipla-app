import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";

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
const GCS_OBJECT_PREFIX = process.env.GCS_OBJECT_PREFIX ?? "spots";
const GCS_CACHE_CONTROL = "public, max-age=31536000, immutable";

let storageClient: Storage | null = null;

function getGcsBucketName(): string | undefined {
  const bucket = process.env.GCS_BUCKET?.trim();
  return bucket || undefined;
}

function getGcsPublicBaseUrl(): string | undefined {
  const base = process.env.GCS_PUBLIC_BASE_URL?.trim();
  return base || undefined;
}

function getStorageClient(): Storage {
  storageClient ??= new Storage();
  return storageClient;
}

/** GCS ストレージが有効か（本番 Cloud Run 向け）。 */
export function isGcsSpotStorageEnabled(): boolean {
  return getGcsBucketName() !== undefined;
}

/** スポット画像の保存先（環境変数 UPLOAD_DIR で上書き可、GCS 未使用時のみ）。 */
export function getSpotUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads", "spots");
}

/** DB / API に保存する公開パス（ローカル FS 用）。 */
export function spotImagePublicPath(spotId: string, ext: string): string {
  return `/uploads/spots/${spotId}.${ext}`;
}

function spotImageObjectName(spotId: string, ext: string): string {
  return `${GCS_OBJECT_PREFIX}/${spotId}.${ext}`;
}

/** GCS 上の公開 URL（DB に保存する値）。 */
export function spotImagePublicUrl(spotId: string, ext: string): string {
  const objectName = spotImageObjectName(spotId, ext);
  const cdnBase = getGcsPublicBaseUrl();
  if (cdnBase) {
    return `${cdnBase.replace(/\/$/, "")}/${objectName}`;
  }
  const bucket = getGcsBucketName();
  if (bucket) {
    return `https://storage.googleapis.com/${bucket}/${objectName}`;
  }
  return spotImagePublicPath(spotId, ext);
}

/** 旧 `/uploads/spots/:filename` から GCS/CDN へリダイレクトする URL。 */
export function spotImageLegacyRedirectUrl(filename: string): string | null {
  if (!isGcsSpotStorageEnabled()) return null;
  if (!/^[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/.test(filename)) return null;

  const cdnBase = getGcsPublicBaseUrl();
  if (cdnBase) {
    return `${cdnBase.replace(/\/$/, "")}/${GCS_OBJECT_PREFIX}/${filename}`;
  }

  const bucket = getGcsBucketName();
  if (!bucket) return null;
  return `https://storage.googleapis.com/${bucket}/${GCS_OBJECT_PREFIX}/${filename}`;
}

export function mimeTypeForFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

async function removeExistingSpotImagesLocal(spotId: string, uploadDir: string): Promise<void> {
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

async function removeExistingSpotImagesGcs(spotId: string): Promise<void> {
  const bucketName = getGcsBucketName();
  if (!bucketName) return;

  const bucket = getStorageClient().bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `${GCS_OBJECT_PREFIX}/${spotId}.` });
  await Promise.all(files.map((file) => file.delete().catch(() => undefined)));
}

async function saveSpotImageLocal(spotId: string, ext: string, buffer: Buffer): Promise<string> {
  const uploadDir = getSpotUploadDir();
  await mkdir(uploadDir, { recursive: true });
  await removeExistingSpotImagesLocal(spotId, uploadDir);

  const filename = `${spotId}.${ext}`;
  await writeFile(join(uploadDir, filename), buffer);
  return spotImagePublicPath(spotId, ext);
}

async function saveSpotImageGcs(
  spotId: string,
  ext: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const bucketName = getGcsBucketName();
  if (!bucketName) {
    throw new Error("GCS_BUCKET が未設定です。");
  }

  await removeExistingSpotImagesGcs(spotId);

  const objectName = spotImageObjectName(spotId, ext);
  const file = getStorageClient().bucket(bucketName).file(objectName);
  await file.save(buffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: GCS_CACHE_CONTROL,
    },
    resumable: false,
  });

  return spotImagePublicUrl(spotId, ext);
}

/** Base64 画像を保存し、公開 URL（GCS）または公開パス（ローカル）を返す。 */
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

  if (isGcsSpotStorageEnabled()) {
    return saveSpotImageGcs(spotId, ext, buffer, mimeType);
  }
  return saveSpotImageLocal(spotId, ext, buffer);
}

/** スポット画像ファイルを読み込む（ローカル FS のみ）。 */
export async function readSpotImageFile(
  filename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (isGcsSpotStorageEnabled()) return null;

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
  if (isGcsSpotStorageEnabled()) {
    await removeExistingSpotImagesGcs(spotId);
    return;
  }
  await removeExistingSpotImagesLocal(spotId, getSpotUploadDir());
}
