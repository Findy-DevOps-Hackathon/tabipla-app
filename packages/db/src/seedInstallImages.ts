import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SeedSpot } from "./seedData.js";
import { resolveSpotUploadDir, SEED_IMAGES_DIR, seedImageFilename } from "./seedData.js";

/** seed-data/images の画像を backend-api の uploads へコピーする。 */
export async function installSeedImages(spots: SeedSpot[]): Promise<number> {
  const uploadDir = resolveSpotUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const available = new Set(await readdir(SEED_IMAGES_DIR).catch(() => [] as string[]));
  let installed = 0;

  for (const spot of spots) {
    const filename = seedImageFilename(spot.imageUrl);
    if (!filename || !available.has(filename)) continue;

    await copyFile(join(SEED_IMAGES_DIR, filename), join(uploadDir, filename));
    installed += 1;
  }

  return installed;
}
