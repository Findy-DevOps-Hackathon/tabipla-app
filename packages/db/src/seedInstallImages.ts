import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { type Bucket, Storage } from "@google-cloud/storage";
import type { SeedSpot } from "./seedData.js";
import { resolveSpotUploadDir, SEED_IMAGES_DIR, seedImageFilename } from "./seedData.js";

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const GCS_CACHE_CONTROL = "public, max-age=31536000, immutable";

let storageClient: Storage | null = null;

export type InstallSeedImagesResult = {
  installed: number;
  spots: SeedSpot[];
  target: "local" | "gcs";
};

function getStorageClient(): Storage {
  storageClient ??= new Storage();
  return storageClient;
}

function getGcsBucketName(): string | undefined {
  const bucket = process.env.GCS_BUCKET?.trim();
  return bucket || undefined;
}

function getGcsObjectPrefix(): string {
  return process.env.GCS_OBJECT_PREFIX?.trim() || "spots";
}

function getGcsPublicBaseUrl(bucket: string): string {
  return process.env.GCS_PUBLIC_BASE_URL?.trim() || `https://storage.googleapis.com/${bucket}`;
}

function gcsPublicImageUrl(bucket: string, filename: string): string {
  const base = getGcsPublicBaseUrl(bucket).replace(/\/$/, "");
  return `${base}/${getGcsObjectPrefix()}/${filename}`;
}

/** 同一 URL 再アップロード時もブラウザが最新画像を取るようバージョンクエリを付与する。 */
function withImageVersion(publicUrl: string, version: number): string {
  const base = publicUrl.split("?")[0]?.split("#")[0] ?? publicUrl;
  return `${base}?v=${version}`;
}

async function removeExistingSpotImagesGcs(bucket: Bucket, spotId: string): Promise<void> {
  const prefix = `${getGcsObjectPrefix()}/${spotId}.`;
  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete().catch(() => undefined)));
}

async function installSeedImagesToGcs(
  spots: SeedSpot[],
  available: Set<string>,
): Promise<InstallSeedImagesResult> {
  const bucketName = getGcsBucketName();
  if (!bucketName) {
    throw new Error("GCS_BUCKET が未設定です。");
  }

  const bucket = getStorageClient().bucket(bucketName);
  const imageVersion = Date.now();
  let installed = 0;
  const nextSpots: SeedSpot[] = [];

  for (const spot of spots) {
    const filename = seedImageFilename(spot.imageUrl);
    if (!filename || !available.has(filename)) {
      nextSpots.push(spot);
      continue;
    }

    const source = join(SEED_IMAGES_DIR, filename);
    const objectName = `${getGcsObjectPrefix()}/${filename}`;
    const contentType = EXT_TO_MIME[extname(filename).toLowerCase()] ?? "application/octet-stream";
    const spotId = spot.id ?? filename.replace(/\.[^.]+$/, "");
    await removeExistingSpotImagesGcs(bucket, spotId);
    await bucket.file(objectName).save(await readFile(source), {
      contentType,
      metadata: {
        cacheControl: GCS_CACHE_CONTROL,
      },
      resumable: false,
    });

    installed += 1;
    nextSpots.push({
      ...spot,
      imageUrl: withImageVersion(gcsPublicImageUrl(bucketName, filename), imageVersion),
    });
  }

  return { installed, spots: nextSpots, target: "gcs" };
}

async function installSeedImagesToLocal(
  spots: SeedSpot[],
  available: Set<string>,
): Promise<InstallSeedImagesResult> {
  const uploadDir = resolveSpotUploadDir();
  await mkdir(uploadDir, { recursive: true });

  let installed = 0;

  for (const spot of spots) {
    const filename = seedImageFilename(spot.imageUrl);
    if (!filename || !available.has(filename)) continue;

    await copyFile(join(SEED_IMAGES_DIR, filename), join(uploadDir, filename));
    installed += 1;
  }

  return { installed, spots, target: "local" };
}

/** seed-data/images の画像を backend-api の uploads または GCS へ反映する。 */
export async function installSeedImages(spots: SeedSpot[]): Promise<InstallSeedImagesResult> {
  const available = new Set(await readdir(SEED_IMAGES_DIR).catch(() => [] as string[]));
  if (getGcsBucketName()) {
    return installSeedImagesToGcs(spots, available);
  }
  return installSeedImagesToLocal(spots, available);
}
