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
  /** DB のおすすめポイント（最大3件） */
  highlights?: string[];
  /** デモデータ用の蘊蓄（highlights がない場合のフォールバック） */
  trivia?: string;
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
  highlights?: string[];
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
    description:
      "小諸城の城跡を整備した城址公園。苔むした石垣や三の門が往時の面影を伝え、春は桜、秋は紅葉の名所として人気です。千曲川を望む断崖の地形を生かした珍しい「穴城」で、四季の自然と歴史をのんびり散策できます。",
    trivia:
      "小諸城は断崖に城郭を築いた「穴城」として知られ、真田昌幸が改修に関わったとも言われます。城址からは千曲川の蛇行が一望でき、小諸八景のひとつ「懐古園の石垣」にも選ばれています。",
    tags: ["歴史", "紅葉", "公園"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s2",
    name: "高峰高原",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description:
      "標高約2,000m of 雄大な高原。夏は高山植物やトレッキング、早朝の雲海、夜は満天の星空が楽しめます。浅間連峰や北アルプスまで見渡す展望が魅力で、四季折々の絶景が訪れる人を魅了します。",
    trivia:
      "長野・群馬の県境に広がる高原で、1920年代に外国人が開拓したとされます。コスモスやニッコウキスゲの花畑が有名で、晴れた日には浅間山から北アルプスまで360度のパノラマが望めます。",
    tags: ["絶景", "高原", "トレッキング"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s3",
    name: "停車場ガーデン",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description:
      "小諸駅前の、四季 of 草花に囲まれたガーデンカフェ。手入れの行き届いた庭を眺めながら、地元産の野菜や果物を生かした料理やスイーツを味わえます。旅の合間のひと休みにぴったりの癒やし空間です。",
    trivia:
      "名前の通り、かつて鉄道の「停車場」の敷地を花園に生かして造られたカフェです。駅から徒歩圏内なのに静けさがあり、小諸の城下町散策の拠点として地元でも愛されています。",
    tags: ["カフェ", "庭園", "ランチ"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s4",
    name: "マンズワイン小諸ワイナリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description:
      "千曲川ワインバレーを代表するワイナリー。丘に広がるぶどう畑を眺めながら国産ワインを試飲でき、醸造見学や日本庭園の散策も楽しめます。お気に入りの一本をお土産に、小諸の風土が育む味を堪能できます。",
    trivia:
      "1950年代からぶどう栽培を始めた、日本ワイン黎明期からの名門ワイナリーです。丘の上から浅間山とぶどう畑を一望でき、併設 of 日本庭園「万酔園」は四季折々の景観が楽しめます。",
    tags: ["ワイン", "試飲", "景色"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s5",
    name: "そば処 草笛",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description:
      "盛りの良さと喉ごしで名高い信州そばの人気店。地元産そば粉のコシある手打ちそばを豊富な量で味わえます。名物「くるみそば」は香ばしい甘みが絶妙で、地元にも長く爱される郷土の味を楽しめます。",
    trivia:
      "小諸は城下町としてそば culture が根付いた土地。草笛の名物「くるみそば」は、地元のくるみをすり潰した特製ダレが名物で、新そばの季節には行列ができることもあります。",
    tags: ["蕎麦", "郷土料理"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s6",
    name: "布引観音（釈尊寺）",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description:
      "切り立つ断崖に建つ荘厳な観音堂。「牛に引かれて善光寺参り」の伝説で知られるパワースポットです。岩肌の参道を登った先に現れる朱塗りのお堂と谷の眺めは圧巻で、神秘的な空気に包まれます。",
    trivia:
      "善光寺参りの「牛に引かれて参る」伝説 of 始まりの地とされる観音堂です。断崖に張り付く朱塗りの堂は小諸八景「布引観音の断崖」としても知られ、参道の岩肌と谷の眺めが荘厳な雰囲気を醸し出します。",
    tags: ["寺", "断崖", "パワースポット"],
    image: IMG_TAKAMINE_2,
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
    description:
      "清らかな水と良質な米に恵まれた、千曲川流域の歴史ある酒蔵。仕込みの名水や地酒の飲み比べを楽しめます。辛口から芳醇まで好みの一本が見つかり、お土産選びにも最適。信州の日本酒文化を味わえます。",
    trivia:
      "千曲川流域は良質な仕込み水に恵まれ、古くから「酒の都」と呼ばれてきました。蔵元によって味わいが異なる地酒を飲み比べでき、冷えた名水との対比も楽しみのひとつです。",
    tags: ["日本酒", "酒蔵", "試飲"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "s8",
    name: "小諸宿 本陣主屋",
    prefecture: "長野県",
    area: "小諸市",
    category: "歴史",
    description:
      "北国街道の宿場町として栄えた小諸宿の本陣を伝える歴史的建造物。江戸時代、大名や公家が休泊した格式ある主屋が残り、太い梁や帳場など当時の佇まいを間近に見学できます。城下町散策とあわせて、宿場の歴史に触れられるスポットです。",
    trivia:
      "本陣とは大名や幕府役人が宿泊した特別な宿で、小諸宿は北国街道の要衝として賑わいました。主屋は国の重要文化財に指定され、街道沿いに連なる古い町並みとともに往時の宿場の風情を今に伝えています。",
    tags: ["歴史", "街道", "町並み"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s9",
    name: "飯綱山公園 眺望スポット",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description:
      "小諸市街と雄大な浅間山を一望できる高台の公園。芝生や遊具もあり家族連れにも人気です。とりわけ夕暮れ時が美しく、茜色の空と街灯りのコントラストは絶景で、写真撮影にも絶好のスポットです。",
    trivia:
      "小諸城より高い飯綱山の丘上にあり、戦国時代には要害としても使われました。城下町全体と浅間山を見渡せるため、夕暮れ時の茜色の空と街灯りのコントラストが特に美しいと評判です。",
    tags: ["眺望", "夕景", "公園"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s10",
    name: "あぐりの湯こもろ",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description:
      "浅間連峰の大パノラマを望む、眺めのよい日帰り温泉。露天風呂から雄大な山並みを眺めてゆったり湯浴みできます。内湯やサウナ、食事処も充実し、観光客にも地元の人にも人気のくつろぎスポットです。",
    trivia:
      "「あぐり」は農業を意味し、地元産の新鮮な食材を使った食事が楽しめる温泉施設です。露天風呂からは浅間連峰の大パノラマが望め、観光の合間に気軽に立ち寄れる日帰り入浴が人気です。",
    tags: ["温泉", "眺望", "日帰り"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s11",
    name: "小諸のパティスリー",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description:
      "地元の果実をふんだんに使った焼き菓子やケーキが評判の人気パティスリー。旬のフルーツのタルトや香ばしい焼き菓子など、優しい甘さのスイーツが揃います。手土産や自分へのご褒美にぴったりのお店です。",
    trivia:
      "小諸はリンゴやぶどうなど果物の産地として知られ、地元果実を使ったスイーツは観光土産としても人気です。旬のフルーツを生かしたタルトは季節ごとに味わいが変わり、地元の恵みを甘い形で楽しめます。",
    tags: ["スイーツ", "カフェ"],
    image: IMG_TAKAMINE_2,
  },
  {
    id: "s12",
    name: "千曲川サイクリングロード",
    prefecture: "長野県",
    area: "小諸市",
    category: "自然",
    description:
      "千曲川沿いを走る爽快なサイクリングコース。川風を感じながら田園風景や山並みを眺めて走れます。高低差が少なく初心者や家族連れも楽しめ、季節ごとの自然も見どころ。小諸の自然をアクティブに体感できます。",
    trivia:
      "千曲川は「日本一急流」とも言われる川のひとつ。サイクリングロードは河岸の景観を楽しみながらのんびり走れ、春の新緑から秋の紅葉まで季節ごとの表情を体感できる人気コースです。",
    tags: ["サイクリング", "川", "アクティブ"],
    image: IMG_TAKAMINE,
  },
  {
    id: "s13",
    name: "小諸高原美術館・白鳥映雪館",
    prefecture: "長野県",
    area: "小諸市",
    category: "観光",
    description:
      "浅間山と小諸市街を見晴らす高台に建つ美術館. 日本画家・白鳥映雪の作品を中心に企画展を楽しめ、展望ラウンジからの眺めも見どころです。静かな館内でアートと景色の両方を味わえる、ゆったりとした時間を過ごせるスポットです。",
    trivia:
      "小諸出身の日本画家・白鳥映雪の作品を収蔵する美術館で、高台の立地から浅間連峰や市街を一望できます。アートだけでなく、大きな窓越しの眺望そのものが「もう一つの作品」として親しまれています。",
    tags: ["美術館", "アート", "眺望"],
    image: IMG_TAKAMINE_3,
  },
  {
    id: "s14",
    name: "千曲川ワインバレーのジェラート工房",
    prefecture: "長野県",
    area: "小諸市",
    category: "グルメ",
    description:
      "小諸の旬の果物や地元産ミルクを使った、できたてジェラートが評判の工房。ぶどうやりんごなど季節のフレーバーが揃い、素材の風味をそのまま生かした濃厚な味わいが楽しめます。ワイナリー巡りやサイクリングの休憩にぴったりのスポットです。",
    trivia:
      "千曲川ワインバレーは果樹栽培が盛んな地域で、ワイン用ぶどうの一部はジェラートにも使われます。季節ごとに変わるフレーバーは地元の収穫と直結しており、その時期ならではの味に出会えるのが楽しみのひとつです。",
    tags: ["スイーツ", "ジェラート", "果物"],
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

/** 「探す」導線（好み診断前）で表示する全スポット一覧。 */
export const EXPLORE_SPOTS: Recommendation[] = [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE].map((s) => ({
  ...s,
  reason: "",
  match: 0,
  memberOnly: false,
}));

export const PREFERENCE_TAGS = ["歴史", "自然", "グルメ", "温泉", "絶景"];

/** スポットIDから蘊蓄テキストを取得する。 */
export function getSpotTrivia(id: string): string | undefined {
  return [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE].find((sp) => sp.id === id)?.trivia;
}
