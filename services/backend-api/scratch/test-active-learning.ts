import { getNextPair } from "../src/diagnosis.js";

// シミュレーション用のユーザーの好みエミュレータ
// 好み: 「自然」「温泉」「絶景」が好き。「歴史」「グルメ」「現代アート」は興味なし。
function evaluatePreference(
  spotName: string,
  category: string[],
  tags: string[],
): "A" | "B" | "neutral" {
  const positiveKeywords = [
    "自然",
    "山",
    "海",
    "渓谷",
    "高原",
    "滝",
    "温泉",
    "絶景",
    "トレッキング",
    "露天風呂",
  ];
  const negativeKeywords = [
    "歴史",
    "寺",
    "神社",
    "城",
    "中華",
    "寿司",
    "グルメ",
    "カフェ",
    "現代アート",
    "美術館",
    "USJ",
    "テーマパーク",
  ];

  const text = `${spotName} ${category.join(" ")} ${tags.join(" ")}`;

  let score = 0;
  for (const kw of positiveKeywords) {
    if (text.includes(kw)) score += 1;
  }
  for (const kw of negativeKeywords) {
    if (text.includes(kw)) score -= 1;
  }

  if (score > 0) return "A"; // 好き寄り
  if (score < 0) return "B"; // 嫌い寄り
  return "neutral";
}

async function simulate() {
  console.log("==================================================");
  console.log("  コールドスタート診断 Active Learning シミュレーション開始");
  console.log("  ユーザーの好み: 「自然・温泉・絶景」が好き。「歴史・グルメ・アート」は嫌い");
  console.log("==================================================\n");

  const likes: string[] = [];
  const nopes: string[] = [];

  let round = 0;
  let isComplete = false;

  while (!isComplete && round < 12) {
    console.log(`--- [ラウンド ${round + 1}] ---`);

    // APIのロジックを直接呼び出す
    const res = await getNextPair({ likes, nopes });

    if (res.isComplete || !res.spotA || !res.spotB) {
      isComplete = true;
      console.log(">> 診断完了！(isComplete = true)\n");
      break;
    }

    const a = res.spotA;
    const b = res.spotB;

    console.log(
      `提示A: ${a.name} [カテゴリ: ${a.category?.join(",")}] [タグ: ${a.tags?.join(",")}]`,
    );
    console.log(
      `提示B: ${b.name} [カテゴリ: ${b.category?.join(",")}] [タグ: ${b.tags?.join(",")}]`,
    );

    // 好み判定
    const prefA = evaluatePreference(a.name, (a.category as string[]) ?? [], a.tags ?? []);
    const prefB = evaluatePreference(b.name, (b.category as string[]) ?? [], b.tags ?? []);

    let chosenId: string;
    let rejectedId: string;

    // AとBのどちらが好みかをエミュレート
    // Aがポジティブ、BがネガティブならAを選ぶ
    if (prefA === "A" && prefB !== "A") {
      chosenId = a.id;
      rejectedId = b.id;
    } else if (prefB === "A" && prefA !== "A") {
      chosenId = b.id;
      rejectedId = a.id;
    } else if (prefA === "neutral" && prefB === "B") {
      chosenId = a.id;
      rejectedId = b.id;
    } else if (prefB === "neutral" && prefA === "B") {
      chosenId = b.id;
      rejectedId = a.id;
    } else {
      // どちらも好き、またはどちらも嫌いの場合は、ランダムにAを選択
      chosenId = a.id;
      rejectedId = b.id;
    }

    const chosenSpotName = chosenId === a.id ? a.name : b.name;
    console.log(`ユーザーの選択: => 「${chosenSpotName}」を選択\n`);

    likes.push(chosenId);
    nopes.push(rejectedId);

    round++;
  }

  // 最終的な診断結果の集計
  console.log("==================================================");
  console.log("  シミュレーション結果");
  console.log("==================================================");
  console.log("選択したスポット (likes):");
  for (const id of likes) {
    console.log(`  - ${id}`);
  }
  console.log("\n選択されなかったスポット (nopes):");
  for (const id of nopes) {
    console.log(`  - ${id}`);
  }
  console.log("==================================================");
}

simulate().catch((err) => {
  console.error("シミュレーションでエラーが発生しました:", err);
});
