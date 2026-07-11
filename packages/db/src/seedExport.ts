import { copyFile, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDatabase } from "./client.js";
import { adminUsers, municipalities, spots } from "./schema.js";
import {
  resolveSpotUploadDir,
  SEED_DATA_DIR,
  SEED_IMAGES_DIR,
  type SeedAdminUser,
  type SeedManifest,
  type SeedMunicipality,
  seedImageFilename,
  stripSpotForSeed,
} from "./seedData.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * 接続中の PostgreSQL と backend-api の uploads から seed-data を書き出す。
 *
 *   DATABASE_URL=... pnpm -C packages/db seed:export
 */
async function main(): Promise<void> {
  const db = createDatabase();
  const uploadDir = resolveSpotUploadDir();

  try {
    const municipalityRows = await db.select().from(municipalities).orderBy(municipalities.name);
    const adminUserRows = await db.select().from(adminUsers).orderBy(adminUsers.email);
    const spotRows = await db.select().from(spots).orderBy(spots.name);

    const seedMunicipalities: SeedMunicipality[] = municipalityRows.map((row) => ({
      id: row.id,
      name: row.name,
    }));
    const seedAdminUsers: SeedAdminUser[] = adminUserRows.map((row) => ({
      id: row.id,
      municipalityName: row.municipalityName,
    }));
    const seedSpots = spotRows.map(stripSpotForSeed);

    await mkdir(SEED_DATA_DIR, { recursive: true });
    await mkdir(SEED_IMAGES_DIR, { recursive: true });

    let imageCount = 0;
    const keepFilenames = new Set<string>();
    for (const spot of seedSpots) {
      const filename = seedImageFilename(spot.imageUrl);
      if (!filename) continue;
      keepFilenames.add(filename);
      const source = join(uploadDir, filename);
      try {
        await copyFile(source, join(SEED_IMAGES_DIR, filename));
        imageCount += 1;
      } catch {
        console.warn(`[db] seed:export 画像をスキップ: ${source}`);
      }
    }

    for (const file of await readdir(SEED_IMAGES_DIR).catch(() => [] as string[])) {
      if (keepFilenames.has(file)) continue;
      await unlink(join(SEED_IMAGES_DIR, file));
      console.info(`[db] seed:export 未参照画像を削除: ${file}`);
    }

    const manifest: SeedManifest = {
      exportedAt: new Date().toISOString(),
      sourceDatabaseUrl: process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@"),
      counts: {
        municipalities: seedMunicipalities.length,
        adminUsers: seedAdminUsers.length,
        spots: seedSpots.length,
        images: imageCount,
      },
    };

    await Promise.all([
      writeJson(join(SEED_DATA_DIR, "manifest.json"), manifest),
      writeJson(join(SEED_DATA_DIR, "municipalities.json"), seedMunicipalities),
      writeJson(join(SEED_DATA_DIR, "admin-users.json"), seedAdminUsers),
      writeJson(join(SEED_DATA_DIR, "spots.json"), seedSpots),
    ]);

    console.log(
      `[db] seed:export 完了: 自治体 ${manifest.counts.municipalities} 件、` +
        `管理ユーザー ${manifest.counts.adminUsers} 件、スポット ${manifest.counts.spots} 件、` +
        `画像 ${manifest.counts.images} 件を ${SEED_DATA_DIR} に書き出しました。`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("[db] seed:export に失敗しました:", error);
  process.exit(1);
});
