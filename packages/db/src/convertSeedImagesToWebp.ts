import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { SEED_DATA_DIR, SEED_IMAGES_DIR, type SeedSpot, seedImageFilename } from "./seedData.js";

const WEBP_QUALITY = 85;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function toWebpFilename(filename: string): string {
  return `${basename(filename, extname(filename))}.webp`;
}

function updateSpotImageUrl(imageUrl: string | null | undefined): string | null | undefined {
  if (!imageUrl) return imageUrl;
  const [withoutQuery = imageUrl] = imageUrl.split("?");
  if (!/\.png$/i.test(withoutQuery)) return imageUrl;
  return withoutQuery.replace(/\.png$/i, ".webp");
}

/**
 * seed-data/images の PNG を WebP に一括変換し、spots.json の imageUrl を更新する。
 *
 *   pnpm -C packages/db seed:convert-images
 */
async function main(): Promise<void> {
  const spotsPath = join(SEED_DATA_DIR, "spots.json");
  const spots = JSON.parse(await readFile(spotsPath, "utf8")) as SeedSpot[];

  const files = await readdir(SEED_IMAGES_DIR);
  const pngFiles = files.filter((file) => extname(file).toLowerCase() === ".png");
  if (pngFiles.length === 0) {
    console.log("[db] seed:convert-images 変換対象の PNG がありません。");
    return;
  }

  let converted = 0;
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const filename of pngFiles) {
    const source = join(SEED_IMAGES_DIR, filename);
    const target = join(SEED_IMAGES_DIR, toWebpFilename(filename));
    const input = await readFile(source);
    beforeBytes += input.length;

    const output = await sharp(input).webp({ quality: WEBP_QUALITY }).toBuffer();
    afterBytes += output.length;
    await writeFile(target, output);
    await unlink(source);
    converted += 1;
    console.info(
      `[db] seed:convert-images ${filename} -> ${toWebpFilename(filename)} ` +
        `(${formatBytes(input.length)} -> ${formatBytes(output.length)})`,
    );
  }

  const referenced = new Set(
    spots
      .map((spot) => seedImageFilename(spot.imageUrl))
      .filter((filename): filename is string => Boolean(filename)),
  );
  const missing = [...referenced].filter(
    (filename) => !files.includes(filename) && !pngFiles.includes(filename),
  );
  const unreferencedWebp = files
    .filter((file) => extname(file).toLowerCase() === ".webp")
    .filter((file) => !referenced.has(file) && !referenced.has(file.replace(/\.webp$/i, ".png")));

  let updatedUrls = 0;
  const nextSpots = spots.map((spot) => {
    const nextUrl = updateSpotImageUrl(spot.imageUrl);
    if (nextUrl !== spot.imageUrl) {
      updatedUrls += 1;
      return { ...spot, imageUrl: nextUrl };
    }
    return spot;
  });

  await writeFile(spotsPath, `${JSON.stringify(nextSpots, null, 2)}\n`, "utf8");

  const saved = beforeBytes - afterBytes;
  const ratio = beforeBytes > 0 ? ((saved / beforeBytes) * 100).toFixed(1) : "0.0";
  console.log(
    `[db] seed:convert-images 完了: ${converted} 枚を WebP に変換 ` +
      `(${formatBytes(beforeBytes)} -> ${formatBytes(afterBytes)}, ${ratio}% 削減)、` +
      `spots.json の imageUrl を ${updatedUrls} 件更新しました。`,
  );

  if (missing.length > 0) {
    console.warn(
      `[db] seed:convert-images 参照されているが seed-data/images に無いファイル: ${missing.join(", ")}`,
    );
  }
  if (unreferencedWebp.length > 0) {
    console.warn(`[db] seed:convert-images 未参照の WebP: ${unreferencedWebp.join(", ")}`);
  }
}

main().catch((error) => {
  console.error("[db] seed:convert-images に失敗しました:", error);
  process.exit(1);
});
