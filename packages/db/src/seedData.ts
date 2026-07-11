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
  /** seed:export では書き出さない。seed 時は ADMIN_*_EMAIL 環境変数で解決。 */
  email?: string;
  municipalityName?: string | null;
};

/** seed-data/spots.json の1件。未使用の municipalityId は含めない。 */
export type SeedSpot = {
  id: string;
  name: string;
  description: string;
  category?: string[] | null;
  area?: string | null;
  prefecture?: string | null;
  address?: string | null;
  highlights?: string[] | null;
  lat?: number | null;
  lon?: number | null;
  imageUrl?: string | null;
};

export type SeedCoupon = NewCouponRow;

/** Seed JSON を DB upsert 用の行へ変換する。 */
export function seedSpotToRow(spot: SeedSpot): Omit<NewSpotRow, "createdAt" | "updatedAt"> {
  return {
    id: spot.id,
    municipalityId: null,
    name: spot.name,
    description: spot.description,
    category: spot.category ?? null,
    area: spot.area ?? null,
    prefecture: spot.prefecture ?? null,
    address: spot.address ?? null,
    highlights: spot.highlights ?? null,
    lat: spot.lat ?? null,
    lon: spot.lon ?? null,
    imageUrl: spot.imageUrl ?? null,
  };
}

type SpotSeedSource = {
  id: string;
  name: string;
  description: string;
  category?: string[] | null;
  area?: string | null;
  prefecture?: string | null;
  address?: string | null;
  highlights?: string[] | null;
  lat?: number | null;
  lon?: number | null;
  imageUrl?: string | null;
};

/** DB 行を seed-data 向けの最小 JSON へ整形する。 */
export function stripSpotForSeed(row: SpotSeedSource): SeedSpot {
  const spot: SeedSpot = {
    id: row.id,
    name: row.name,
    description: row.description,
  };
  if (row.category != null) spot.category = row.category;
  if (row.area != null) spot.area = row.area;
  if (row.prefecture != null) spot.prefecture = row.prefecture;
  if (row.address != null) spot.address = row.address;
  if (row.highlights != null) spot.highlights = row.highlights;
  if (row.lat != null) spot.lat = row.lat;
  if (row.lon != null) spot.lon = row.lon;
  if (row.imageUrl != null) spot.imageUrl = row.imageUrl;
  return spot;
}

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
