/**
 * スワイプ型レコメンド体験のデモデータ（長野県小諸市）。
 *
 * 現状の backend-api はスワイプ/レコメンド用エンドポイントを持たないため、
 * デモ用に小諸市のスポットをハードコードしている。将来的には目的地（location）
 * を引数に backend-api からスポット候補を取得して `SwipeSpot[]` に詰め替える。
 */

/** スポットのカテゴリ。バッジ色は `categoryBadgeClass` で決まる。 */
export type SpotCategory = "観光" | "グルメ" | "宿泊" | "自然" | "歴史";

/** 好み診断（スワイプ）の最大回数。 */
export const SWIPE_LIMIT = 2;

/** 「好みをより詳しく設定する」（深掘り診断）のスワイプ回数。 */
export const SWIPE_LIMIT_REFINE = 10;

/** スワイプデッキ 1 枚分のスポット。 */
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

/** おすすめ結果 1 件（スポット + おすすめ理由 + 相性スコア）。 */
export type Recommendation = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
  description: string;
  tags: string[];
  /** 生成したおすすめ理由（先頭のアイコンは UI 側で付与）。 */
  reason: string;
  /** 相性スコア（0〜100）。 */
  match: number;
  /** クーポンの特典内容。未指定（undefined）ならクーポンなしのスポット。 */
  coupon?: string;
  /** 会員限定クーポンか（false なら非会員でも未ログインで利用可）。クーポンなしでは無視。 */
  memberOnly: boolean;
  /** スポットのメイン画像。 */
  image: string;
};

/** 目的地サジェスト 1 件。 */
export type Suggestion = {
  /** 見出し（例: 小諸市（長野県））。 */
  title: string;
  /** 補助テキスト（例: 長野県小諸市）。null なら 1 行表示。 */
  subtitle: string | null;
  /** 先頭にピンアイコンを付けて強調するか。 */
  pinned?: boolean;
};

const IMG_TAKAMINE = "/spots/takamine.png";
const IMG_TAKAMINE_2 = "/spots/takamine-2.png";
const IMG_TAKAMINE_3 = "/spots/takamine-3.png";

/** スワイプデッキのスポット候補（デモ）。 */
export const SWIPE_SPOTS: SwipeSpot[] = [
  {
    id: "takamine-kogen",
    name: "高峰高原",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "標高約2,000mの高原。トレッキングや雲海の展望が人気。夏は涼しく、星空も美しい。",
    tags: ["トレッキング", "雲海", "高原"],
    image: IMG_TAKAMINE,
  },
  {
    id: "kaikoen",
    name: "懐古園",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "小諸城址の公園。紅葉の名所として知られ、四季折々の景色が楽しめる歴史スポット。",
    tags: ["紅葉", "城址", "公園"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "asama-yacho",
    name: "浅間山麓 野鳥の森",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "浅間山の麓に広がる自然の森。バードウォッチングや散策に最適。",
    tags: ["野鳥", "自然", "散策"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "teishaba-garden",
    name: "停車場ガーデン",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地元食材を使ったカフェと庭園。小諸の食文化をゆっくり楽しめる。",
    tags: ["カフェ", "地元食材", "庭園"],
    image: IMG_TAKAMINE,
  },
  {
    id: "nunobiki-kannon",
    name: "布引観音",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "断崖に建つ釈尊寺の観音堂。「牛に引かれて善光寺参り」の伝説の地。",
    tags: ["寺院", "絶景", "伝説"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "takamine-onsen",
    name: "高峰温泉",
    prefecture: "長野県",
    area: "小諸市",
    category: "宿泊",
    description: "雲上の露天風呂が名物のランプの宿。満天の星空と雲海を一望できる。",
    tags: ["温泉", "露天風呂", "星空"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "manns-wine",
    name: "マンズワイン小諸ワイナリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "日本庭園を併設したワイナリー。試飲や工場見学で小諸ワインを満喫。",
    tags: ["ワイン", "試飲", "見学"],
    image: IMG_TAKAMINE,
  },
  {
    id: "komoro-castle",
    name: "小諸城 三之門",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description: "重要文化財に指定された城門。武田信玄ゆかりの穴城の面影を残す。",
    tags: ["城", "重要文化財", "歴史"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "kohmi-line",
    name: "しなの鉄道 小諸駅",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "レトロな駅舎が旅情を誘う交通拠点。高原観光の玄関口。",
    tags: ["鉄道", "レトロ", "拠点"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "asama-sanroku",
    name: "浅間サンライン展望",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "浅間山を望む爽快なドライブルート。夕景と夜景のビューポイント。",
    tags: ["ドライブ", "夜景", "絶景"],
    image: IMG_TAKAMINE,
  },
];

/**
 * 「好みをより詳しく設定する」で表示する追加スワイプデッキ（デモ）。
 *
 * 初回デッキ（SWIPE_SPOTS）とは別のスポット群を出し、好き嫌いをさらに
 * 振り分けてもらうことで好みの解像度を上げる。
 */
export const SWIPE_SPOTS_REFINE: SwipeSpot[] = [
  {
    id: "refine-saku-balloon",
    name: "佐久バルーンフェスティバル",
    prefecture: "長野県",
    area: "佐久市",
    category: "観光",
    description: "色とりどりの熱気球が早朝の空を埋め尽くす春の風物詩。澄んだ空気の中の絶景。",
    tags: ["熱気球", "イベント", "早朝"],
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-soba-kobo",
    name: "信州そば打ち工房",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地粉を使った手打ちそば体験。自分で打った十割そばをその場で味わえる。",
    tags: ["そば打ち", "体験", "地粉"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "refine-bessho-onsen",
    name: "別所温泉 外湯めぐり",
    prefecture: "長野県",
    area: "上田市",
    category: "宿泊",
    description: "信州最古とされる温泉郷。レトロな街並みを浴衣で歩く外湯めぐりが楽しい。",
    tags: ["温泉街", "外湯", "浴衣"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "refine-utsukushigahara",
    name: "美ヶ原高原 王ヶ頭",
    prefecture: "長野県",
    area: "松本市",
    category: "自然",
    description: "標高2,000mの大草原に立つ展望スポット。360度の北アルプス大パノラマ。",
    tags: ["高原", "パノラマ", "雲上"],
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-zenkoji",
    name: "善光寺 お朝事",
    prefecture: "長野県",
    area: "長野市",
    category: "歴史",
    description: "早朝の本堂で行われる荘厳な勤行。お数珠頂戴の体験もできる信仰の中心地。",
    tags: ["寺院", "朝事", "信仰"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "refine-karuizawa-shaw",
    name: "軽井沢 ショー記念礼拝堂",
    prefecture: "長野県",
    area: "軽井沢町",
    category: "観光",
    description: "木立に囲まれた軽井沢発祥の地の小さな教会。静かな散策と避暑にぴったり。",
    tags: ["教会", "避暑", "森"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "refine-togakushi",
    name: "戸隠神社 奥社の杉並木",
    prefecture: "長野県",
    area: "長野市",
    category: "自然",
    description: "樹齢400年超の杉並木が続く神秘の参道。パワースポットとして名高い。",
    tags: ["神社", "杉並木", "パワースポット"],
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-obuse-kuri",
    name: "小布施 栗スイーツ巡り",
    prefecture: "長野県",
    area: "小布施町",
    category: "グルメ",
    description: "栗の名産地で味わう出来立ての栗あんやモンブラン。食べ歩きが人気。",
    tags: ["スイーツ", "栗", "食べ歩き"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "refine-matsumoto-castle",
    name: "松本城 夜間ライトアップ",
    prefecture: "長野県",
    area: "松本市",
    category: "歴史",
    description: "現存最古の五重天守。水堀に映る漆黒の城と北アルプスの稜線が美しい。",
    tags: ["国宝", "城", "ライトアップ"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "refine-kamikochi",
    name: "上高地 河童橋",
    prefecture: "長野県",
    area: "松本市",
    category: "自然",
    description: "梓川の清流と穂高連峰を望む山岳景勝地。木道散策で大自然を満喫できる。",
    tags: ["渓谷", "トレッキング", "清流"],
    image: IMG_TAKAMINE,
  },
];

/** 目的地入力画面のサジェスト（デモ）。 */
export const DESTINATION_SUGGESTIONS: Suggestion[] = [
  { title: "小諸市（長野県）", subtitle: null, pinned: true },
  { title: "小諸市立図書館", subtitle: "長野県小諸市" },
  { title: "長野県", subtitle: null },
];

/** 1回に表示・追加読み込みするおすすめ件数。 */
export const RECOMMENDATIONS_PAGE_SIZE = 10;

/** おすすめ結果（デモ）。 */
export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "takamine-kogen",
    name: "高峰高原",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "標高約2,000mの高原。トレッキングや雲海の展望が人気。",
    tags: ["トレッキング", "雲海"],
    reason: "自然・絶景好みにぴったりの高原スポット",
    match: 94,
    coupon: "ビジターセンターで温かい飲み物を1杯サービス",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "asama-yacho",
    name: "浅間山麓 野鳥の森",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "浅間山の麓に広がる自然の森。バードウォッチングや散策に最適。",
    tags: ["野鳥", "自然"],
    reason: "トレッキング好きにおすすめの静かな森",
    match: 88,
    coupon: "ガイド付きバードウォッチングツアー 10% OFF",
    memberOnly: true,
    image: IMG_TAKAMINE_3,
  },
  {
    id: "kaikoen",
    name: "懐古園",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "小諸城址の公園。紅葉の名所として知られ、四季折々の景色が楽しめる。",
    tags: ["紅葉", "城址"],
    reason: "観光・歴史好みにマッチする名所",
    match: 82,
    coupon: "入園料 大人500円 → 400円（100円引き）",
    memberOnly: false,
    image: IMG_TAKAMINE_2,
  },
  {
    id: "teishaba-garden",
    name: "停車場ガーデン",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地元食材を使ったカフェと庭園。小諸の食文化をゆっくり楽しめる。",
    tags: ["カフェ", "地元食材"],
    reason: "のんびりグルメ派に合うカフェスポット",
    match: 79,
    coupon: "ドリンク1杯 100円引き",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "nunobiki-kannon",
    name: "布引観音",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "断崖に建つ釈尊寺の観音堂。「牛に引かれて善光寺参り」の伝説の地。",
    tags: ["寺院", "絶景"],
    reason: "歴史と絶景を両立するパワースポット",
    match: 77,
    coupon: "参拝記念御朱印帳 500円 → 400円",
    memberOnly: false,
    image: IMG_TAKAMINE_2,
  },
  {
    id: "takamine-onsen",
    name: "高峰温泉",
    prefecture: "長野県",
    area: "小諸市",
    category: "宿泊",
    description: "雲上の露天風呂が名物のランプの宿。満天の星空と雲海を一望できる。",
    tags: ["温泉", "露天風呂"],
    reason: "温泉・星空好きにぴったりの宿",
    match: 91,
    coupon: "日帰り入浴 500円引き（会員限定）",
    memberOnly: true,
    image: IMG_TAKAMINE_3,
  },
  {
    id: "manns-wine",
    name: "マンズワイン小諸ワイナリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "日本庭園を併設したワイナリー。試飲や工場見学で小諸ワインを満喫。",
    tags: ["ワイン", "試飲"],
    reason: "グルメ・体験好きにおすすめ",
    match: 75,
    coupon: "試飲セット 200円引き",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "komoro-castle",
    name: "小諸城 三之門",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description: "重要文化財に指定された城門。武田信玄ゆかりの穴城の面影を残す。",
    tags: ["城", "歴史"],
    reason: "歴史好きのあなたにマッチする城跡",
    match: 73,
    coupon: "城址ガイドブック プレゼント",
    memberOnly: false,
    image: IMG_TAKAMINE_2,
  },
  {
    id: "kohmi-line",
    name: "しなの鉄道 小諸駅",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description: "レトロな駅舎が旅情を誘う交通拠点。高原観光の玄関口。",
    tags: ["鉄道", "レトロ"],
    reason: "旅の始まりにふさわしいレトロ駅",
    match: 68,
    coupon: "駅ナカスイーツ 10% OFF",
    memberOnly: false,
    image: IMG_TAKAMINE_3,
  },
  {
    id: "asama-sanroku",
    name: "浅間サンライン展望",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "浅間山を望む爽快なドライブルート。夕景と夜景のビューポイント。",
    tags: ["ドライブ", "夜景"],
    reason: "ドライブ・絶景好きにおすすめ",
    match: 85,
    coupon: "展望台カフェ ドリンクサービス",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-saku-balloon",
    name: "佐久バルーンフェスティバル",
    prefecture: "長野県",
    area: "佐久市",
    category: "観光",
    description: "色とりどりの熱気球が早朝の空を埋め尽くす春の風物詩。",
    tags: ["熱気球", "イベント"],
    reason: "非日常体験を求めるあなたへ",
    match: 72,
    coupon: "早朝観覧席 500円引き",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-soba-kobo",
    name: "信州そば打ち工房",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description: "地粉を使った手打ちそば体験。自分で打った十割そばをその場で味わえる。",
    tags: ["そば打ち", "体験"],
    reason: "体験型グルメが好きな方に",
    match: 70,
    coupon: "体験料 10% OFF（会員限定）",
    memberOnly: true,
    image: IMG_TAKAMINE_2,
  },
  {
    id: "refine-bessho-onsen",
    name: "別所温泉 外湯めぐり",
    prefecture: "長野県",
    area: "上田市",
    category: "宿泊",
    description: "信州最古とされる温泉郷。レトロな街並みを浴衣で歩く外湯めぐりが楽しい。",
    tags: ["温泉街", "外湯"],
    reason: "温泉巡り好きにおすすめの温泉郷",
    match: 83,
    coupon: "外湯共通券 200円引き",
    memberOnly: false,
    image: IMG_TAKAMINE_3,
  },
  {
    id: "refine-utsukushigahara",
    name: "美ヶ原高原 王ヶ頭",
    prefecture: "長野県",
    area: "松本市",
    category: "自然",
    description: "標高2,000mの大草原に立つ展望スポット。360度の北アルプス大パノラマ。",
    tags: ["高原", "パノラマ"],
    reason: "大パノラマの絶景を楽しみたい方へ",
    match: 89,
    coupon: "ロープウェイ往復 300円引き",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-zenkoji",
    name: "善光寺 お朝事",
    prefecture: "長野県",
    area: "長野市",
    category: "歴史",
    description: "早朝の本堂で行われる荘厳な勤行。お数珠頂戴の体験もできる信仰の中心地。",
    tags: ["寺院", "朝事"],
    reason: "静かな早朝体験を好む方に",
    match: 66,
    coupon: "お守り 100円引き",
    memberOnly: false,
    image: IMG_TAKAMINE_2,
  },
  {
    id: "refine-karuizawa-shaw",
    name: "軽井沢 ショー記念礼拝堂",
    prefecture: "長野県",
    area: "軽井沢町",
    category: "観光",
    description: "木立に囲まれた軽井沢発祥の地の小さな教会。静かな散策と避暑にぴったり。",
    tags: ["教会", "避暑"],
    reason: "避暑・散策好きにおすすめ",
    match: 74,
    coupon: "記念ポストカード プレゼント",
    memberOnly: false,
    image: IMG_TAKAMINE_3,
  },
  {
    id: "refine-togakushi",
    name: "戸隠神社 奥社の杉並木",
    prefecture: "長野県",
    area: "長野市",
    category: "自然",
    description: "樹齢400年超の杉並木が続く神秘の参道。パワースポットとして名高い。",
    tags: ["神社", "杉並木"],
    reason: "パワースポット・自然好きにマッチ",
    match: 81,
    coupon: "参道カフェ ドリンク半額",
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "refine-obuse-kuri",
    name: "小布施 栗スイーツ巡り",
    prefecture: "長野県",
    area: "小布施町",
    category: "グルメ",
    description: "栗の名産地で味わう出来立ての栗あんやモンブラン。食べ歩きが人気。",
    tags: ["スイーツ", "栗"],
    reason: "スイーツ・食べ歩き好きにおすすめ",
    match: 71,
    coupon: "栗スイーツセット 150円引き",
    memberOnly: false,
    image: IMG_TAKAMINE_2,
  },
  // --- クーポンなしのスポット（coupon 未指定） ---
  {
    id: "komoro-kogen-park",
    name: "小諸高原 見晴らしの丘",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description: "浅間連峰を一望できる無料の展望広場。芝生でのんびり過ごせる穴場スポット。",
    tags: ["展望", "ピクニック"],
    reason: "のんびり絶景を楽しみたいあなたに",
    match: 80,
    memberOnly: false,
    image: IMG_TAKAMINE,
  },
  {
    id: "saku-river-walk",
    name: "千曲川リバーサイド遊歩道",
    prefecture: "長野県",
    area: "佐久市",
    category: "観光",
    description: "千曲川沿いに整備された散策路。四季の野花と水辺の風景が楽しめる。",
    tags: ["散策", "川沿い"],
    reason: "ゆったり散歩が好きな方におすすめ",
    match: 69,
    memberOnly: false,
    image: IMG_TAKAMINE_3,
  },
];

/** スポット ID から会員クーポンコードを生成する（デモ用の決定的な擬似コード）。 */
export function couponCodeFor(id: string): string {
  let hash = 0;
  for (const ch of id) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `TABI-${hash.toString(36).toUpperCase().padStart(5, "0").slice(0, 5)}`;
}

/** 分析中に表示する好みタグ（デモ）。 */
export const PREFERENCE_TAGS = ["自然", "トレッキング", "絶景", "温泉"];
