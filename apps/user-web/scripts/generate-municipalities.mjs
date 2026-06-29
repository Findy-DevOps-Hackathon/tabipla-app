/**
 * 全国市区町村データを Open Data から取得し places-data.json を生成する。
 *
 * データソース: code4fukui/localgovjp (MIT)
 * https://github.com/code4fukui/localgovjp
 *
 * 使い方: node scripts/generate-municipalities.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../src/data/places-data.json");

const PREF_URL = "https://code4fukui.github.io/localgovjp/prefjp.json";
const MUNI_URL = "https://code4fukui.github.io/localgovjp/localgovjp.json";

/** 「札幌市 中央区」などの空白を除去して検索しやすくする。 */
function normalizeLabel(value) {
  return value.replace(/\s+/g, "");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  const [prefRows, muniRows] = await Promise.all([fetchJson(PREF_URL), fetchJson(MUNI_URL)]);

  const prefectures = prefRows.map((row) => [row.pref, row.prefkana]);
  const municipalities = muniRows.map((row) => [
    normalizeLabel(row.city),
    normalizeLabel(row.citykana),
    row.pref,
  ]);

  const payload = {
    source: "https://github.com/code4fukui/localgovjp",
    generatedAt: new Date().toISOString(),
    prefectures,
    municipalities,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${prefectures.length} prefectures and ${municipalities.length} municipalities to ${OUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
