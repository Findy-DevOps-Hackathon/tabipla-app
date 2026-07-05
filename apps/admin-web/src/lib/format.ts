import { getFixedPrefecture } from "../master/index.ts";
import { extractAreaFromAddress } from "./address.ts";
import { formatCategories } from "./categories.ts";

export const MAX_SPOT_DESCRIPTION_LENGTH = 200;

export function trimSpotDescription(text: string): string {
  return text.trim().slice(0, MAX_SPOT_DESCRIPTION_LENGTH);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRelativeJa(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "1分前";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function spotToCsvRow(spot: {
  name: string;
  description: string;
  category?: string | string[];
  area?: string;
  prefecture?: string;
  address?: string;
  location?: { lat: number; lon: number };
  price?: number;
}): string {
  const quoteCsvField = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const prefecture = spot.prefecture ?? getFixedPrefecture();
  const area =
    spot.area ?? (spot.address ? extractAreaFromAddress(spot.address, getFixedPrefecture()) : "");
  return [
    spot.name,
    spot.description,
    formatCategories(spot.category),
    area,
    prefecture,
    spot.address ?? "",
    spot.location?.lat ?? "",
    spot.location?.lon ?? "",
    spot.price ?? "",
  ]
    .map((v) => quoteCsvField(String(v)))
    .join(",");
}

export const CSV_HEADER = "name,description,category,area,prefecture,address,lat,lon,price";
