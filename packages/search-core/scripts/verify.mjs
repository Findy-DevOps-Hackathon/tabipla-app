// search-core の一連の動作を実機(Elasticsearch)で検証するスクリプト。
//   ensureIndex -> indexDocument -> keywordSearch -> deleteDocument
//
// 事前に `pnpm build` 済みであること（dist を読み込む）。
// 接続先は環境変数 ES_NODE（既定 http://localhost:9200）。
//
// 実行: node scripts/verify.mjs

import {
  createElasticsearchClient,
  deleteDocument,
  ensureIndex,
  indexDocument,
  keywordSearch,
  pingElasticsearch,
} from "../dist/index.js";

const INDEX = process.env.ES_INDEX ?? "verify-spots";
const DOC_ID = "verify-spot-1";

function step(label) {
  console.log(`\n--- ${label} ---`);
}

async function main() {
  const client = createElasticsearchClient();

  step("0. ping");
  const alive = await pingElasticsearch(client);
  console.log("ping:", alive);
  if (!alive) throw new Error("Elasticsearch に接続できません");

  step("1. ensureIndex");
  const ensured = await ensureIndex(client, INDEX);
  console.log("ensureIndex:", ensured);

  step("2. indexDocument");
  const indexed = await indexDocument(
    client,
    {
      id: DOC_ID,
      name: "清水寺",
      description: "京都を代表する世界遺産の寺院。検証用のサンプル本文。",
      category: "観光",
      area: "京都市",
      prefecture: "京都府",
      createdAt: new Date().toISOString(),
    },
    { index: INDEX, refresh: true },
  );
  console.log("indexDocument:", indexed);

  step("3. keywordSearch (query='京都')");
  const found = await keywordSearch(client, {
    query: "京都",
    index: INDEX,
    size: 5,
  });
  console.log("hits:", found.length);
  for (const r of found) {
    console.log(`  - id=${r.id} score=${r.score} name=${r.document?.name}`);
  }
  if (found.length === 0) throw new Error("検索結果が0件でした（期待: 1件以上）");

  step("4. keywordSearch with filter (category=観光)");
  const filtered = await keywordSearch(client, {
    query: "",
    filters: { category: "観光" },
    index: INDEX,
  });
  console.log("filtered hits:", filtered.length);

  step("5. deleteDocument");
  const deleted = await deleteDocument(client, DOC_ID, {
    index: INDEX,
    refresh: true,
  });
  console.log("deleteDocument:", deleted);

  step("6. keywordSearch after delete (expect 0)");
  const afterDelete = await keywordSearch(client, {
    query: "京都",
    index: INDEX,
    size: 5,
  });
  console.log("hits after delete:", afterDelete.length);

  step("cleanup: delete index");
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  console.log("index deleted:", INDEX);

  console.log("\n✅ 全ステップ成功");
}

main().catch((err) => {
  console.error("\n❌ 検証失敗:", err);
  process.exitCode = 1;
});
