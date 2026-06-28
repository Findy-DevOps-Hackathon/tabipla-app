#!/usr/bin/env node
/**
 * Figma REST API から管理画面デザインのメタデータを取得し、
 * docs/figma-export/ に JSON を書き出す。
 *
 * 使い方:
 *   export FIGMA_ACCESS_TOKEN=figd_...
 *   node scripts/figma/fetch-design.mjs
 *
 * 環境変数:
 *   FIGMA_ACCESS_TOKEN  (必須) Figma Personal Access Token
 *   FIGMA_FILE_KEY      (任意) 既定: C3SvlA4YQFNyhz0yvqqcRx (Findy-DevOps)
 *   FIGMA_NODE_IDS      (任意) カンマ区切り。既定: 59:9
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "docs/figma-export");

const token = process.env.FIGMA_ACCESS_TOKEN;
const fileKey = process.env.FIGMA_FILE_KEY ?? "C3SvlA4YQFNyhz0yvqqcRx";
const nodeIds = (process.env.FIGMA_NODE_IDS ?? "59:9").split(",").map((s) => s.trim());

if (!token) {
  console.error("[figma] FIGMA_ACCESS_TOKEN が未設定です。");
  console.error("  Figma → Settings → Security → Personal access tokens で発行してください。");
  process.exit(1);
}

async function figmaGet(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status}: ${body}`);
  }
  return res.json();
}

/** ノードツリーから実装に使う情報を抽出する。 */
function extractDesignTokens(node, path = "") {
  const entries = [];
  const name = path ? `${path}/${node.name}` : node.name;

  if (node.type === "TEXT" && node.characters) {
    entries.push({
      kind: "text",
      name,
      characters: node.characters,
      style: node.style ?? null,
    });
  }

  if (node.fills?.length) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.color) {
        entries.push({
          kind: "fill",
          name,
          color: fill.color,
          opacity: fill.opacity ?? 1,
        });
      }
    }
  }

  if (node.absoluteBoundingBox) {
    entries.push({
      kind: "frame",
      name,
      type: node.type,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      entries.push(...extractDesignTokens(child, name));
    }
  }

  return entries;
}

/** ページ一覧と主要フレーム名を収集。 */
function collectScreens(document) {
  const screens = [];
  for (const page of document.children ?? []) {
    for (const child of page.children ?? []) {
      if (child.type === "FRAME" || child.type === "COMPONENT") {
        screens.push({
          page: page.name,
          name: child.name,
          id: child.id,
          width: child.absoluteBoundingBox?.width,
          height: child.absoluteBoundingBox?.height,
        });
      }
    }
  }
  return screens;
}

async function main() {
  console.log(`[figma] file=${fileKey} nodes=${nodeIds.join(",")}`);

  const [fileMeta, nodesMeta] = await Promise.all([
    figmaGet(`/files/${fileKey}?depth=1`),
    figmaGet(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeIds.join(","))}`),
  ]);

  const screens = collectScreens(fileMeta.document);
  const nodeDetails = {};

  for (const [id, wrapper] of Object.entries(nodesMeta.nodes ?? {})) {
    const doc = wrapper.document;
    nodeDetails[id] = {
      name: doc?.name,
      type: doc?.type,
      tokens: doc ? extractDesignTokens(doc) : [],
    };
  }

  const stylesRes = await figmaGet(`/files/${fileKey}/styles`).catch(() => ({
    meta: { styles: [] },
  }));

  const output = {
    fetchedAt: new Date().toISOString(),
    fileKey,
    fileName: fileMeta.name,
    lastModified: fileMeta.lastModified,
    screens,
    nodeIds,
    nodes: nodeDetails,
    styles: stylesRes.meta?.styles ?? [],
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "admin-design.json");
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`[figma] 書き出し完了: ${outPath}`);
  console.log(`[figma] 画面候補: ${screens.length} 件`);
  for (const s of screens.slice(0, 10)) {
    console.log(`  - ${s.page} / ${s.name} (${s.id})`);
  }
  if (screens.length > 10) console.log(`  ... 他 ${screens.length - 10} 件`);
}

main().catch((err) => {
  console.error("[figma] 失敗:", err.message);
  process.exit(1);
});
