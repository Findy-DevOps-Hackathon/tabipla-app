import type { Spot } from "../contracts.js";

// 小諸市デモの暫定データ。B8の本投入(シード)で不要になる＝ここを差し替えるだけ。
export const KOMORO_SPOTS: Spot[] = [
  {
    id: "s1",
    name: "懐古園",
    category: "history",
    location: { lat: 36.325, lon: 138.425 },
    priceLevel: 1,
    description: "小諸城址の公園。紅葉の名所。",
  },
  {
    id: "s2",
    name: "高峰高原",
    category: "nature",
    location: { lat: 36.4, lon: 138.43 },
    priceLevel: 0,
    description: "標高2000mの高原。雲海とトレッキング。",
  },
  {
    id: "s3",
    name: "停車場ガーデン",
    category: "gourmet",
    location: { lat: 36.328, lon: 138.428 },
    priceLevel: 2,
    description: "小諸駅前の庭園カフェ。地元食材のランチ。",
  },
  {
    id: "s4",
    name: "マンズワイン小諸ワイナリー",
    category: "gourmet",
    location: { lat: 36.335, lon: 138.408 },
    priceLevel: 2,
    description: "千曲川ワインバレーのワイナリー。ぶどう畑の景色と試飲。",
  },
  {
    id: "s5",
    name: "そば処 草笛",
    category: "gourmet",
    location: { lat: 36.327, lon: 138.424 },
    priceLevel: 1,
    description: "盛りの良さで知られる信州そばの店。",
  },
  {
    id: "s6",
    name: "中棚荘",
    category: "history",
    location: { lat: 36.33, lon: 138.43 },
    priceLevel: 3,
    description: "島崎藤村ゆかりの温泉宿。りんごを浮かべた風呂が名物。",
  },
  {
    id: "s7",
    name: "千曲川流域の酒蔵（試飲）",
    category: "gourmet",
    location: { lat: 36.322, lon: 138.42 },
    priceLevel: 1,
    description: "地酒の蔵元。仕込み水と日本酒の試飲が楽しめる。",
  },
  {
    id: "s8",
    name: "布引観音（釈尊寺）",
    category: "history",
    location: { lat: 36.345, lon: 138.435 },
    priceLevel: 0,
    description: "断崖に建つ観音堂。牛に引かれて善光寺参りの伝説で知られる。",
  },
  {
    id: "s9",
    name: "飯綱山公園 眺望スポット",
    category: "nature",
    location: { lat: 36.318, lon: 138.418 },
    priceLevel: 0,
    description: "市街と浅間山を望む高台の公園。夕景がきれい。",
  },
  {
    id: "s10",
    name: "あぐりの湯こもろ",
    category: "nature",
    location: { lat: 36.35, lon: 138.44 },
    priceLevel: 1,
    description: "眺めの良い日帰り温泉。露天から浅間連峰。",
  },
  {
    id: "s11",
    name: "小諸のパティスリー",
    category: "gourmet",
    location: { lat: 36.326, lon: 138.426 },
    priceLevel: 2,
    description: "地元果実を使った焼き菓子とケーキの店。",
  },
  {
    id: "s12",
    name: "千曲川サイクリングロード",
    category: "nature",
    location: { lat: 36.31, lon: 138.41 },
    priceLevel: 0,
    description: "川沿いを走る爽快なサイクリングコース。",
  },
];

// カード用の景色画像。デモはサーバ生成のSVG風景(/img/:id)＝オフラインでも必ず表示。
// 本物の写真にしたい場合は各値を実URL(例 "https://.../s4.jpg")に差し替えるだけ。
export const SPOT_IMAGES: Record<string, string> = {
  s1: "/img/s1",
  s2: "/img/s2",
  s3: "/img/s3",
  s4: "/img/s4",
  s5: "/img/s5",
  s6: "/img/s6",
  s7: "/img/s7",
  s8: "/img/s8",
  s9: "/img/s9",
  s10: "/img/s10",
  s11: "/img/s11",
  s12: "/img/s12",
};

// 営業時間・滞在目安（仮データ＝後でB2/施設データに差し替え）。エージェントの制約推論に使う。
export const SPOT_HOURS: Record<string, { open: string; close: string; stayMin: number }> = {
  s1: { open: "09:00", close: "17:00", stayMin: 90 }, // 懐古園
  s2: { open: "08:00", close: "17:00", stayMin: 120 }, // 高峰高原
  s3: { open: "10:00", close: "18:00", stayMin: 60 }, // 停車場ガーデン
  s4: { open: "10:00", close: "16:30", stayMin: 90 }, // ワイナリー(閉店早め)
  s5: { open: "11:00", close: "15:00", stayMin: 60 }, // 草笛(ランチのみ)
  s6: { open: "11:00", close: "21:00", stayMin: 90 }, // 中棚荘(温泉)
  s7: { open: "10:00", close: "17:00", stayMin: 60 }, // 酒蔵
  s8: { open: "08:00", close: "16:00", stayMin: 60 }, // 布引観音
  s9: { open: "00:00", close: "24:00", stayMin: 45 }, // 眺望公園(夕景向き)
  s10: { open: "10:00", close: "22:00", stayMin: 90 }, // あぐりの湯
  s11: { open: "10:00", close: "19:00", stayMin: 30 }, // パティスリー
  s12: { open: "00:00", close: "24:00", stayMin: 90 }, // サイクリング
};

// スワイプの好み学習に使う特徴タグ。仮データ＝後で本データ(スポット属性/タグ)に差し替えやすいよう分離。
export const SPOT_TAGS: Record<string, string[]> = {
  s1: ["歴史", "紅葉", "公園"],
  s2: ["絶景", "高原", "トレッキング"],
  s3: ["カフェ", "庭園", "ランチ"],
  s4: ["ワイン", "試飲", "景色"],
  s5: ["蕎麦", "郷土料理"],
  s6: ["温泉", "文学", "宿"],
  s7: ["日本酒", "酒蔵", "試飲"],
  s8: ["寺", "断崖", "パワースポット"],
  s9: ["眺望", "夕景", "公園"],
  s10: ["温泉", "眺望", "日帰り"],
  s11: ["スイーツ", "カフェ"],
  s12: ["サイクリング", "川", "アクティブ"],
};
