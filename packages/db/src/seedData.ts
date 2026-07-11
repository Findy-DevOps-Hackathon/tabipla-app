import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NewCouponRow, NewSpotRow } from "./schema.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const SEED_DATA_DIR = join(srcDir, "../seed-data");
export const SEED_IMAGES_DIR = join(SEED_DATA_DIR, "images");

export type SeedManifest = {
  exportedAt: string;
  sourceDatabaseUrl?: string;
  counts: {
    municipalities: number;
    adminUsers: number;
    spots: number;
    coupons: number;
    images: number;
  };
};

export type SeedMunicipality = {
  id: string;
  name: string;
};

export type SeedAdminUser = {
  id: string;
  email: string;
  municipalityName?: string | null;
};

export type SeedSpot = Omit<NewSpotRow, "createdAt" | "updatedAt">;
export type SeedCoupon = NewCouponRow;

export type SeedBundle = {
  manifest: SeedManifest;
  municipalities: SeedMunicipality[];
  adminUsers: SeedAdminUser[];
  spots: SeedSpot[];
  coupons: SeedCoupon[];
};

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

/** `packages/db/seed-data/` からシード用 JSON を読み込む。 */
export async function loadSeedBundle(): Promise<SeedBundle> {
  const [manifest, municipalities, adminUsers, spots, coupons] = await Promise.all([
    readJsonFile<SeedManifest>(join(SEED_DATA_DIR, "manifest.json")),
    readJsonFile<SeedMunicipality[]>(join(SEED_DATA_DIR, "municipalities.json")),
    readJsonFile<SeedAdminUser[]>(join(SEED_DATA_DIR, "admin-users.json")),
    readJsonFile<SeedSpot[]>(join(SEED_DATA_DIR, "spots.json")),
    readJsonFile<SeedCoupon[]>(join(SEED_DATA_DIR, "coupons.json")),
  ]);

  return { manifest, municipalities, adminUsers, spots, coupons };
}

/** `/uploads/spots/foo.webp` や GCS/CDN の `/spots/foo.webp` から seed-data 内のファイル名を得る。 */
export function seedImageFilename(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const [withoutQuery = imageUrl] = imageUrl.split("?");
  const [relativePath = withoutQuery] = withoutQuery.split("#");
  const pathname =
    imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
      ? new URL(imageUrl).pathname
      : relativePath;
  const match = pathname.match(/\/(?:uploads\/)?spots\/([^/?#]+)$/);
  return match?.[1] ?? null;
}

function resolveRepoRoot(): string {
  return join(srcDir, "../../..");
}

/** backend-api が配信するローカル画像ディレクトリ。 */
export function resolveSpotUploadDir(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  return join(resolveRepoRoot(), "services/backend-api/data/uploads/spots");
}
