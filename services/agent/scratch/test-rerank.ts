import { personalizedPlan } from "../src/agents/personalized.js";

async function runTest() {
  console.log("==================================================");
  console.log("  パーソナライズ推薦 (ハイブリッド検索＆リランキング) 統合テスト");
  console.log("==================================================\n");

  // スワイプ診断結果 (likes はすべて自然系、nopes は歴史・グルメ)
  const sw = {
    likes: ["ref-11", "ref-42", "ref-40", "ref-17", "ref-47"], // 上高地, 美瑛, 白川郷, 高千穂, ひたち
    nopes: ["ref-01", "ref-26", "ref-45"], // 清水寺, 横浜中華街, 中村藤吉
  };

  const userId = "test-user-99";
  const timeBudget = "4時間";
  const origin = "小諸駅";
  const travelMemory = "静かな高原の自然の中で、ゆっくり温泉に入ってリラックスしたいです。";

  try {
    const res = await personalizedPlan(sw, userId, timeBudget, origin, travelMemory);

    console.log("【1. プロファイルサマリー】");
    console.log(`  ${res.profileSummary}\n`);

    console.log("【2. おすすめスポット一覧 (リランキング順)】");
    if (res.recommendations.length === 0) {
      console.log("  (候補が見つかりませんでした)");
    } else {
      res.recommendations.forEach((rec, idx) => {
        console.log(`  [${idx + 1}] ${rec.name} (カテゴリ: ${rec.category}) - スコア: ${rec.score}`);
        console.log(`       タグ: ${rec.tags.join(", ") || "なし"}`);
      });
    }
    console.log("");

    console.log("【3. プラン要約サマリー (LLM生成)】");
    console.log(`${res.result}\n`);

    console.log("==================================================");
    console.log("  テスト完了: 正常終了");
    console.log("==================================================");
  } catch (error) {
    console.error("テスト実行中にエラーが発生しました:", error);
    process.exitCode = 1;
  }
}

runTest();
