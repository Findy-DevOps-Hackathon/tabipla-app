/**
 * スワイプ型レコメンド体験のスポットデータ（長野県小諸市）。
 *
 * エージェント側 (s1〜s12) のスポット定義と一致させ、
 * バックエンド経由で直接エージェントから推薦を得られるように設計。
 */

export type SpotCategory = "観光" | "グルメ" | "宿泊" | "自然" | "歴史";

export const SWIPE_LIMIT = 3; // 初回は3件スワイプ
export const SWIPE_LIMIT_REFINE = 9; // 追加ラウンドは9件

export type SwipeSpot = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
  description: string;
  tags: string[];
  image: string;
};

export type Recommendation = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
  description: string;
  tags: string[];
  reason: string;
  match: number;
  memberOnly: boolean;
  image: string;
};

export type Suggestion = {
  title: string;
  subtitle: string | null;
  pinned?: boolean;
};

// スワイプカード用の画像アセットパス（用意された写真）
const IMG_TAKAMINE = "/spots/takamine.png";
const IMG_TAKAMINE_2 = "/spots/takamine-2.png";
const IMG_TAKAMINE_3 = "/spots/takamine-3.png";

// スワイプデッキ：s1 〜 s6
export const SWIPE_SPOTS: SwipeSpot[] = [
  {
    id: "s1",
    name: "懐古園",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description: "小諸城址の公園。紅葉の名所として知られ、四季折々の景色が楽しめる歴史スポット。",
    tags: ["歴史", "紅葉", "公園"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s2",
    name: "高峰高原",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "標高約2,000mの高原。トレッキングや雲海の展望が人気。夏は涼しく、星空も美しい。",
    tags: ["絶景", "高原", "トレッキング"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s3",
    name: "停車場ガーデン",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地元食材を使ったカフェと庭園。小諸の食文化をゆっくり楽しめる。",
    tags: ["カフェ", "庭園", "ランチ"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s4",
    name: "マンズワイン小諸ワイナリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "千曲川ワインバレー of ワイナリー。ぶどう畑 of 景色と試飲。",
    tags: ["ワイン", "試飲", "景色"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s5",
    name: "そば処 草笛",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "盛りの良さで知られる信州そばの店。",
    tags: ["蕎麦", "郷土料理"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s6",
    name: "中棚荘",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description: "島崎藤村ゆかりの温泉宿。りんごを浮かべた風呂が名物。",
    tags: ["温泉", "文学", "宿"],
    image: IMG_TAKAMINE_3,
  },
];

// 追加の深掘りスワイプデッキ：s7 〜 s12
export const SWIPE_SPOTS_REFINE: SwipeSpot[] = [
  {
    id: "s7",
    name: "千曲川流域の酒蔵（試飲）",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地酒の蔵元。仕込み水と日本酒の試飲が楽しめる。",
    tags: ["日本酒", "酒蔵", "試飲"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "s8",
    name: "布引観音（釈尊寺）",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description: "断崖に建つ観音堂。牛に引かれて善光寺参りの伝説で知られる。",
    tags: ["寺", "断崖", "パワースポット"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s9",
    name: "飯綱山公園 眺望スポット",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "市街と浅間山を望む高台の公園。夕景がきれい。",
    tags: ["眺望", "夕景", "公園"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s10",
    name: "あぐりの湯こもろ",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "眺めの良い日帰り温泉。露天から浅間連峰。",
    tags: ["温泉", "眺望", "日帰り"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s11",
    name: "小諸のパティスリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地元果実を使った焼き菓子とケーキの店。",
    tags: ["スイーツ", "カフェ"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s12",
    name: "千曲川サイクリングロード",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "川沿いを走る爽快なサイクリングコース。",
    tags: ["サイクリング", "川", "アクティブ"],
    image: IMG_TAKAMINE,
  },
];

export const DESTINATION_SUGGESTIONS: Suggestion[] = [
  { title: "小諸市（長野県）", subtitle: null, pinned: true },
  { title: "小諸市立図書館", subtitle: "長野県小諸市" },
  { title: "長野県", subtitle: null },
];

export const RECOMMENDATIONS_PAGE_SIZE = 10;

// 初期ロード時のモックデータは空にする（APIから動的に取得）
export const RECOMMENDATIONS: Recommendation[] = [];

export const PREFERENCE_TAGS = ["歴史", "自然", "グルメ", "温泉", "絶景"];

