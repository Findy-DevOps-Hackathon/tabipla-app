/** agent の大カテゴリ + 横断 common でサブテーマを定義する。 */
export type ThemeCategoryKey = "nature" | "gourmet" | "history" | "common";

export type ThemeRule = { pattern: RegExp; label: string };

export const THEME_RULES_BY_CATEGORY: Record<ThemeCategoryKey, ThemeRule[]> = {
  history: [
    { pattern: /城|城跡|本陣|大手門|天守|石垣|穴城/, label: "城" },
    { pattern: /神社|寺|仏閣|禅|伽藍|開創|古刹|門前/, label: "神社・寺院" },
    { pattern: /宿場|北国街道|街道|宿場町|石畳|馬場裏|大名行列/, label: "街道" },
    { pattern: /武家|藩|和睦|町屋|商家|本陣/, label: "町家" },
    { pattern: /明治|大正|昭和|近代|私塾|義塾|開校/, label: "近代史" },
    { pattern: /産業|風穴|蚕|織物|酒蔵|酒造|商業遺産/, label: "産業" },
    { pattern: /参勤交代|善光寺|参り|参拝|門前町/, label: "参拝" },
    { pattern: /朝市|定期市|市場|露店/, label: "市場" },
    { pattern: /美術館|博物館|記念館|展示|資料館/, label: "博物館" },
    { pattern: /文学|文豪|詩人|作家|島崎|文学館/, label: "文学" },
    { pattern: /灯台|海岸.*歴史|明治時代に建/, label: "近代施設" },
    { pattern: /伝統工芸|輪島塗|工芸/, label: "伝統工芸" },
    { pattern: /世界遺産|国宝|重要文化財|文化財/, label: "文化財" },
  ],
  nature: [
    { pattern: /山|高原|浅間|登山|アルプス|山麓|山並み/, label: "高原" },
    { pattern: /湖|池|湿原|水辺|渓谷|川|滝/, label: "湖川" },
    { pattern: /海|海岸|ビーチ|断崖|日本海|岬/, label: "海" },
    { pattern: /桜|花見|梅|芝桜|花の/, label: "花" },
    { pattern: /紅葉|もみじ|秋の/, label: "紅葉" },
    { pattern: /森林|林|苔|原生/, label: "森林" },
    { pattern: /動物|植物|野生|鳥|鹿/, label: "動植物" },
    { pattern: /温泉|源泉|露天|入浴|大浴場/, label: "温泉" },
    { pattern: /絶景|パノラマ|展望|一望|眺望/, label: "眺望" },
    { pattern: /国立公園|公園|湿原|自然/, label: "自然公園" },
    { pattern: /星空|夜|朝日|夕日|日の出|日没/, label: "景観" },
  ],
  gourmet: [
    { pattern: /ワイン|ぶどう|テイスティング|醸造|ワイナリー|セラー/, label: "ワイン" },
    { pattern: /日本酒|地酒|酒蔵|酒造|蔵元/, label: "酒蔵" },
    { pattern: /いちご|梨|りんご|ぶどう狩|狩り|食べ放題/, label: "果物狩り" },
    { pattern: /郷土|名物|地元.*食|ご当地/, label: "郷土料理" },
    { pattern: /カフェ|スイーツ|ジェラート|喫茶/, label: "カフェ" },
    { pattern: /朝市|市場|直売|魚介|野菜/, label: "市場" },
    { pattern: /レストラン|食事|ランチ|ディナー|コース/, label: "食事体験" },
    { pattern: /地産地消|地元産|特産/, label: "地産地消" },
  ],
  common: [
    { pattern: /散策|ウォーク|ハイキング|街歩|ステップ/, label: "散策" },
    { pattern: /体験|ワークショップ|参加型/, label: "体験" },
    { pattern: /家族|子供|子ども|親子|ファミリー/, label: "家族向け" },
    { pattern: /ショップ|お土産|買い物|直売所/, label: "ショッピング" },
    { pattern: /写真|フォト|映え|インスタ/, label: "写真映え" },
    { pattern: /アクセス|駅近|徒歩|駐車/, label: "アクセス" },
    { pattern: /のんびり|ゆったり|癒|リラックス/, label: "ゆったり" },
    { pattern: /宇宙|科学|プラネタリウム|実験/, label: "科学・学び" },
    { pattern: /遊園地|アトラクション|乗り物|テーマパーク/, label: "遊園" },
    { pattern: /動物園|水族館|アニマル/, label: "動物園" },
  ],
};

/** DB / agent いずれの表記でもテーマ抽出用カテゴリへ正規化する。 */
export function normalizeThemeCategoryKey(category?: string): ThemeCategoryKey {
  if (!category) return "common";
  const normalized = category.trim();
  if (normalized === "nature" || normalized === "自然") return "nature";
  if (normalized === "gourmet" || normalized === "食" || /グルメ/.test(normalized)) {
    return "gourmet";
  }
  if (
    normalized === "history" ||
    normalized === "歴史・文化" ||
    /歴史|文化|遺産|芸術|都市/.test(normalized)
  ) {
    return "history";
  }
  if (/レジャー|スポーツ/.test(normalized)) return "common";
  if (/ショッピング/.test(normalized)) return "gourmet";
  return "common";
}

export function getThemeRulesForCategory(category?: string): ThemeRule[] {
  const key = normalizeThemeCategoryKey(category);
  const specific = THEME_RULES_BY_CATEGORY[key];
  const common = THEME_RULES_BY_CATEGORY.common;
  return [...specific, ...common];
}

/** おすすめポイント・紹介文から、カテゴリに応じたサブテーマ語を抽出する。 */
export function extractThemesFromText(
  text: string,
  category?: string,
  extraText?: string,
): string[] {
  const source = [text, extraText].filter(Boolean).join("\n");
  if (!source.trim()) return [];

  const themes = new Set<string>();
  for (const { pattern, label } of getThemeRulesForCategory(category)) {
    if (pattern.test(source)) themes.add(label);
  }
  return [...themes];
}

/** @deprecated extractThemesFromText を使用 */
export function extractThemesFromHighlight(text: string, category?: string): string[] {
  return extractThemesFromText(text, category);
}
