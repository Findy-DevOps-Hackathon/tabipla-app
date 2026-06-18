// search-core のベクトル/ハイブリッド検索を実機(Elasticsearch)で検証するスクリプト。
//   ensureIndex -> bulk index(embedding付き) -> vectorSearch -> hybridSearch -> error path
//
// 埋め込みベクトルはダミー（決定的に生成）。embedding 生成自体は search-core の責務外のため、
// ここでは「次元数が一致した妥当なベクトル」を渡して kNN の挙動だけを確認する。
//
// 事前に `pnpm build` 済みであること。接続先は ES_NODE（既定 http://localhost:9200）。
// 実行: node scripts/verify-vector.mjs

import {
  createElasticsearchClient,
  pingElasticsearch,
  ensureIndex,
  bulkIndexDocuments,
  vectorSearch,
  hybridSearch,
  VECTOR_DIMS,
} from "../dist/index.js";

const INDEX = process.env.ES_INDEX ?? "verify-vector-spots";

function step(label) {
  console.log(`\n--- ${label} ---`);
}

// 指定した次元に「スパイク」を立てた決定的なベクトルを作る。
// spikeIndex 方向に強く向いたベクトル同士は cosine 類似度が高くなる。
function makeVec(spikeIndex, spikeValue = 1) {
  const v = new Array(VECTOR_DIMS).fill(0.0001);
  v[spikeIndex % VECTOR_DIMS] = spikeValue;
  return v;
}

async function main() {
  console.log("VECTOR_DIMS =", VECTOR_DIMS);
  const client = createElasticsearchClient();

  step("0. ping");
  if (!(await pingElasticsearch(client))) {
    throw new Error("Elasticsearch に接続できません");
  }
  console.log("ping: true");

  step("1. ensureIndex");
  console.log(await ensureIndex(client, INDEX));

  step("2. bulk index (embedding付き 3件)");
  const docs = [
    { id: "vec-a", name: "スポットA", description: "海と山に関する内容", embedding: makeVec(0) },
    { id: "vec-b", name: "スポットB", description: "都市と建築に関する内容", embedding: makeVec(1) },
    { id: "vec-c", name: "スポットC", description: "食と文化に関する内容", embedding: makeVec(2) },
  ];
  console.log(await bulkIndexDocuments(client, docs, { index: INDEX, refresh: true }));

  step("3. vectorSearch (vec-a 方向のクエリ → vec-a が1位の想定)");
  const queryVec = makeVec(0, 0.9);
  const vres = await vectorSearch(client, { embedding: queryVec, k: 3, index: INDEX });
  vres.forEach((r, i) => console.log(`  ${i + 1}. id=${r.id} score=${r.score?.toFixed(4)}`));
  if (vres[0]?.id !== "vec-a") {
    throw new Error(`vectorSearch 1位が vec-a ではありません: ${vres[0]?.id}`);
  }
  console.log("=> 1位 vec-a を確認");

  step("4. hybridSearch (query のみ → キーワード検索に委譲)");
  const hq = await hybridSearch(client, { query: "建築", index: INDEX });
  console.log("hits:", hq.map((r) => r.id));

  step("5. hybridSearch (embedding のみ → ベクトル検索に委譲)");
  const he = await hybridSearch(client, { embedding: makeVec(2, 0.9), index: INDEX, k: 3 });
  console.log("top:", he[0]?.id, "(vec-c の想定)");

  step("6. hybridSearch (query + embedding → スコア加算統合)");
  const hb = await hybridSearch(client, {
    query: "海",
    embedding: makeVec(0, 0.9),
    index: INDEX,
    size: 3,
    knnBoost: 2,
  });
  hb.forEach((r, i) => console.log(`  ${i + 1}. id=${r.id} score=${r.score?.toFixed(4)}`));

  step("7. error path: 次元不一致の embedding は例外になる");
  try {
    await vectorSearch(client, { embedding: [0.1, 0.2, 0.3], index: INDEX });
    throw new Error("例外が発生しませんでした（想定外）");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("次元数が一致しません")) throw e;
    console.log("期待どおり例外:", msg.split("。")[0]);
  }

  step("8. error path: 空 embedding は例外になる");
  try {
    await vectorSearch(client, { embedding: [], index: INDEX });
    throw new Error("例外が発生しませんでした（想定外）");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("空でない数値配列")) throw e;
    console.log("期待どおり例外:", msg.split("（")[0]);
  }

  step("cleanup: delete index");
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  console.log("index deleted:", INDEX);

  console.log("\n✅ ベクトル/ハイブリッド検証 全ステップ成功");
}

main().catch((err) => {
  console.error("\n❌ 検証失敗:", err);
  process.exitCode = 1;
});
