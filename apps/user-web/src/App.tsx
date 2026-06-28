import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, logout, type UserAccount } from "./auth.ts";
import { BottomNav, type NavTab } from "./components/BottomNav.tsx";
import { CouponModal } from "./components/CouponModal.tsx";
import { PhoneShell } from "./components/PhoneShell.tsx";
import { SpotDetailModal } from "./components/SpotDetailModal.tsx";
import {
  type Recommendation,
  type SpotCategory,
  SWIPE_LIMIT,
  SWIPE_LIMIT_REFINE,
  SWIPE_SPOTS,
  SWIPE_SPOTS_REFINE,
} from "./data/spots.ts";
import {
  isDetailedDiagnosisComplete,
  isDiagnosisComplete,
  markDetailedDiagnosisComplete,
  markDiagnosisComplete,
  resetDiagnosis,
} from "./lib/diagnosis.ts";
import { useHideFooterOnScroll } from "./lib/useHideFooterOnScroll.ts";
import { isVisited, markVisited, toggleVisited, type VisitableSpot } from "./lib/visited.ts";
import { AuthScreen } from "./screens/AuthScreen.tsx";
import { HistoryScreen } from "./screens/HistoryScreen.tsx";
import { InputScreen } from "./screens/InputScreen.tsx";
import { MemoryScreen } from "./screens/MemoryScreen.tsx";
import { ProcessingScreen } from "./screens/ProcessingScreen.tsx";
import { RecommendationsScreen } from "./screens/RecommendationsScreen.tsx";
import { SwipeScreen } from "./screens/SwipeScreen.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

/** 体験フローのステップ。 */
type Step = "welcome" | "input" | "swipe" | "memory" | "processing" | "recommendations" | "history";

/** リロードしても直前の画面を保つために step を保存する localStorage キー。 */
const STEP_KEY = "tabipla-step";
const STEP_VALUES: Step[] = [
  "welcome",
  "input",
  "swipe",
  "memory",
  "processing",
  "recommendations",
  "history",
];

/** localStorage に保存された step を読み出す（未保存・不正値なら welcome）。 */
function readStoredStep(): Step {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    return raw && (STEP_VALUES as string[]).includes(raw) ? (raw as Step) : "welcome";
  } catch {
    return "welcome";
  }
}

/**
 * ブラウザ履歴と連動させるための「画面状態」のスナップショット。
 * step だけでなくモーダル（詳細・クーポン・認証）の開閉も含め、
 * ブラウザの戻る操作で直前の見た目に正確に復元できるようにする。
 */
type ViewSnapshot = {
  step: Step;
  refining: boolean;
  swipeDeck: typeof SWIPE_SPOTS;
  runId: number;
  returnFromHistory: Step;
  detailRec: Recommendation | null;
  detailVisited: boolean;
  activeCoupon: Recommendation | null;
  authPrompt: { reason?: string } | null;
  pendingCoupon: Recommendation | null;
  pendingVisit: VisitableSpot | null;
};

/**
 * 「画面（ステップ）＋開いているモーダル」を表す識別キー。
 * このキーが変わったときだけブラウザ履歴に新しいエントリを積む
 *（＝「行った」のトグルなど見た目に出ない状態変化では履歴を増やさない）。
 */
function viewKey(s: ViewSnapshot): string {
  return [s.step, s.detailRec?.id ?? "", s.activeCoupon?.id ?? "", s.authPrompt ? "auth" : ""].join(
    "|",
  );
}

/** history.state 内に画面スナップショットを格納するためのキー。 */
const HISTORY_STATE_KEY = "tabiplaNav";

/**
 * tabipla ユーザー向け Web のメインフロー。
 *
 * ようこそ → 好み診断（最大5回スワイプ）→ 目的地選択 → 分析中 → おすすめ一覧、という
 * スワイプ型レコメンド体験をステップ状態機械で制御する（Figma デザイン準拠）。
 *
 * 会員登録は必須ではないが、**クーポン利用**と**行った履歴の保存**には
 * ログイン/登録を促す（履歴はアカウントに紐づくため）。
 */
export default function App() {
  const [user, setUser] = useState<UserAccount | null>(getSession);
  const [step, setStep] = useState<Step>(readStoredStep);
  const [, setLocation] = useState("");
  const [swipedCount, setSwipedCount] = useState(0);
  // スワイプ画面を再入場時にリセットするための再マウントキー。
  const [runId, setRunId] = useState(0);
  // 現在のスワイプデッキ。初回は SWIPE_SPOTS、「好みをより詳しく設定する」では追加デッキ。
  // リロードで直接 swipe に復元された場合に備え、初期値も初回ラウンド分に切り出しておく。
  const [swipeDeck, setSwipeDeck] = useState<typeof SWIPE_SPOTS>(() =>
    SWIPE_SPOTS.slice(0, SWIPE_LIMIT),
  );
  // 詳細設定ラウンド（好みの深掘り）中か。見出し表示の切り替えに使う。
  const [refining, setRefining] = useState(false);
  // 好み診断の完了状態。localStorage に保存してリロード後も保つが、ログイン/ログアウト時にリセットする。
  const [diagnosisComplete, setDiagnosisComplete] = useState(isDiagnosisComplete);
  // 「好みをより詳しく設定する」を済ませたか。済ませたら同ボタンは表示しない。
  const [detailedComplete, setDetailedComplete] = useState(isDetailedDiagnosisComplete);

  // エージェント連携用状態管理
  const [likes, setLikes] = useState<string[]>([]);
  const [nopes, setNopes] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [debateLog, setDebateLog] = useState<
    { agent: string; message: string; thought?: string }[]
  >([]);
  const [isFetchDone, setIsFetchDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<
    Record<string, { role: "user" | "ai"; text: string; isError?: boolean }[]>
  >({});
  const [travelMemory, setTravelMemory] = useState("");
  const [pendingMemoryTransition, setPendingMemoryTransition] = useState(false);

  // 認証プロンプト（クーポン利用やログインボタンで開く）。null なら非表示。
  const [authPrompt, setAuthPrompt] = useState<{ reason?: string } | null>(null);
  // 認証後に開くべきクーポン（未ログインで「クーポンを使う」を押したとき）。
  const [pendingCoupon, setPendingCoupon] = useState<Recommendation | null>(null);
  // 認証後に履歴へ追加すべきスポット（未ログインで「行った」を押したとき）。
  const [pendingVisit, setPendingVisit] = useState<VisitableSpot | null>(null);
  // 表示中のクーポン。null なら非表示。
  const [activeCoupon, setActiveCoupon] = useState<Recommendation | null>(null);
  // ホームのおすすめカードから開いたスポット詳細。null なら非表示。
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  // 詳細表示中スポットの「行った」状態（モーダル内のトグル表示用）。
  const [detailVisited, setDetailVisited] = useState(false);
  // 履歴画面から「戻る」で復帰する先（履歴タブを開く直前の画面）。
  const [returnFromHistory, setReturnFromHistory] = useState<Step>("recommendations");
  const stepRef = useRef(step);
  stepRef.current = step;
  const shellRef = useRef<HTMLDivElement>(null);
  const footerVisible = useHideFooterOnScroll(step);

  // --- ブラウザ「戻る」連動 -------------------------------------------------
  // ルーターを使わず step の状態機械で画面を切り替えているため、そのままでは
  // ブラウザの戻る操作が効かない。現在の画面状態を逐次ブラウザ履歴へ積み、
  // popstate（戻る/進む）で対応するスナップショットへ復元する。

  // 現在の画面状態を常に最新で参照するためのスナップショット。
  // 復元情報はメモリのスタックではなく history.state 自体に保存するため、
  // HMR や StrictMode の再マウントでスタックが失われても戻る操作が壊れない。
  const navSnapshot: ViewSnapshot = {
    step,
    refining,
    swipeDeck,
    runId,
    returnFromHistory,
    detailRec,
    detailVisited,
    activeCoupon,
    authPrompt,
    pendingCoupon,
    pendingVisit,
  };
  const navSnapshotRef = useRef(navSnapshot);
  navSnapshotRef.current = navSnapshot;

  // 現在位置の通し番号と直近の画面キー。popstate 中の再 push を防ぐフラグも持つ。
  const navIndexRef = useRef(0);
  const navKeyRef = useRef<string>("");
  const isPopRef = useRef(false);
  // 次の画面状態変化を「新しい履歴の push」ではなく「現在エントリの置き換え」にするフラグ。
  // 認証画面はログインで消費される一時ステップのため、ログイン成功後の遷移で認証エントリを
  // 残さない（残すと、クーポン利用後の「戻る」で再びログイン画面に戻ってしまう）。
  const replaceNextRef = useRef(false);

  // スナップショットを React state へ反映する（戻る/進むの復元時に使用）。
  const applySnapshot = useCallback((s: ViewSnapshot) => {
    setStep(s.step);
    setRefining(s.refining);
    setSwipeDeck(s.swipeDeck);
    setRunId(s.runId);
    setReturnFromHistory(s.returnFromHistory);
    setDetailRec(s.detailRec);
    setDetailVisited(s.detailVisited);
    setActiveCoupon(s.activeCoupon);
    setAuthPrompt(s.authPrompt);
    setPendingCoupon(s.pendingCoupon);
    setPendingVisit(s.pendingVisit);
  }, []);

  // 初期化と popstate 購読（マウント時に一度だけ）。
  useEffect(() => {
    const initial = navSnapshotRef.current;
    navIndexRef.current = 0;
    navKeyRef.current = viewKey(initial);
    // 現在の履歴エントリに初期スナップショットを保存する。
    window.history.replaceState({ [HISTORY_STATE_KEY]: { idx: 0, snapshot: initial } }, "");

    const onPopState = (event: PopStateEvent) => {
      const data = event.state?.[HISTORY_STATE_KEY] as
        | { idx: number; snapshot: ViewSnapshot }
        | undefined;
      if (data?.snapshot) {
        isPopRef.current = true;
        navIndexRef.current = data.idx;
        navKeyRef.current = viewKey(data.snapshot);
        applySnapshot(data.snapshot);
        return;
      }
      // 当アプリ管理外／古いビルドの履歴エントリ（スナップショットなし）に戻った場合でも
      // 固まらないよう、開いているオーバーレイは最低限閉じる（自己修復）。
      const current = navSnapshotRef.current;
      if (current.detailRec || current.activeCoupon || current.authPrompt) {
        isPopRef.current = true;
        setDetailRec(null);
        setActiveCoupon(null);
        setAuthPrompt(null);
        setPendingCoupon(null);
        setPendingVisit(null);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // applySnapshot は安定（依存なしの useCallback）なので一度だけ実行する。
  }, [applySnapshot]);

  // 画面状態が変わるたびに、新しい画面なら履歴へ push、同じ画面なら現在エントリを更新する。
  // 本体では最新値を navSnapshotRef 経由で読むため（stale closure 回避）、依存配列の各 state は
  // 「この効果を再実行させるためのトリガー」として意図的に列挙している。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 画面状態の変化を検知する再実行トリガー。
  useEffect(() => {
    // popstate 由来の状態反映では新たに履歴を積まない。
    if (isPopRef.current) {
      isPopRef.current = false;
      return;
    }
    const snapshot = navSnapshotRef.current;
    const key = viewKey(snapshot);
    // 認証成功後など、現在エントリ（例: 認証画面）を新しい画面で置き換えたい場合。
    // idx は据え置きのまま履歴を上書きし、戻り先に一時ステップを残さない。
    if (replaceNextRef.current) {
      replaceNextRef.current = false;
      navKeyRef.current = key;
      window.history.replaceState(
        { [HISTORY_STATE_KEY]: { idx: navIndexRef.current, snapshot } },
        "",
      );
      return;
    }
    if (key === navKeyRef.current) {
      // 同じ画面のままの軽微な状態変化（「行った」トグル等）。
      // 戻ったときに最新の中身を復元できるよう、現在の履歴エントリを上書きする。
      window.history.replaceState(
        { [HISTORY_STATE_KEY]: { idx: navIndexRef.current, snapshot } },
        "",
      );
      return;
    }
    const nextIndex = navIndexRef.current + 1;
    navIndexRef.current = nextIndex;
    navKeyRef.current = key;
    window.history.pushState({ [HISTORY_STATE_KEY]: { idx: nextIndex, snapshot } }, "");
  }, [
    step,
    refining,
    swipeDeck,
    runId,
    returnFromHistory,
    detailRec,
    detailVisited,
    activeCoupon,
    authPrompt,
    pendingCoupon,
    pendingVisit,
  ]);
  // -------------------------------------------------------------------------

  // 画面（ステップ）切り替え時はウィンドウのスクロール位置を先頭へ戻す。
  // スクロールはドキュメント側で行うため、前画面のスクロール量が残らないようにする。
  // biome-ignore lint/correctness/useExhaustiveDependencies: step 変化時に再実行させるためのトリガー。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // リロードしても直前の画面を保てるよう、現在の step を保存する。
  useEffect(() => {
    try {
      localStorage.setItem(STEP_KEY, step);
    } catch {
      // localStorage 不可環境では復元を諦める（致命的ではない）。
    }
  }, [step]);

  // 訪問履歴の保存先 ID。履歴の保存にはログインが必要なため、未ログイン時は "guest"
  //（実質的に空のバケット）になる。
  const visitorId = user?.id ?? "guest";

  const beginSwipe = useCallback(() => {
    setSwipeDeck(SWIPE_SPOTS.slice(0, SWIPE_LIMIT));
    setLikes([]);
    setNopes([]);
    setRecommendations([]);
    setDebateLog([]);
    setRefining(false);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, []);

  const selectDestination = useCallback((loc: string) => {
    setLocation(loc);
    setStep("memory");
  }, []);

  // 「好みをより詳しく設定する」: 追加デッキ（10件）で好き嫌いをさらに振り分ける。
  const refinePreferences = useCallback(() => {
    setSwipeDeck(SWIPE_SPOTS_REFINE.slice(0, SWIPE_LIMIT_REFINE));
    setRefining(true);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, []);

  const handleSwipeComplete = useCallback(
    (likedIds: string[]) => {
      setLikes((prev) => {
        const next = [...prev];
        for (const id of likedIds) {
          if (!next.includes(id)) next.push(id);
        }
        return next;
      });

      const deckIds = swipeDeck.map((s) => s.id);
      const nopedIds = deckIds.filter((id) => !likedIds.includes(id));
      setNopes((prev) => {
        const next = [...prev];
        for (const id of nopedIds) {
          if (!next.includes(id)) next.push(id);
        }
        return next;
      });

      setSwipedCount(swipeDeck.length);
      // 深掘り（10件）を一度完了したら、以降は「好みをより詳しく設定する」を出さない。
      if (refining) {
        setDetailedComplete(true);
        markDetailedDiagnosisComplete();
      }
      // 初回は目的地をまだ選んでいないので入力画面へ。深掘り時は目的地確定済みなので分析へ。
      setStep(refining ? "processing" : "input");
    },
    [refining, swipeDeck],
  );

  useEffect(() => {
    if (step !== "processing") return;

    let active = true;
    setIsFetchDone(false);
    setApiError(null);

    async function fetchPlan() {
      try {
        const res = await fetch("/api/v1/personalized/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            likes,
            nopes,
            userId: visitorId,
            timeBudget: "4時間",
            origin: "小諸駅",
            travelMemory,
          }),
        });

        const data = await res.json();
        if (!active) return;

        if (!res.ok || data.error) {
          throw new Error(data.error || "プランの作成に失敗しました。");
        }

        const categoryMap: Record<string, SpotCategory> = {
          history: "歴史",
          nature: "自然",
          gourmet: "グルメ",
        };

        const getSpotImage = (id: string): string => {
          const s = [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE].find((sp) => sp.id === id);
          return s ? s.image : `/api/img/${id}`;
        };

        const mapped: Recommendation[] = (data.recommendations || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          prefecture: "長野県",
          area: "小諸市",
          category: categoryMap[r.category] || "観光",
          description: r.description,
          tags: r.tags || [],
          reason: (r.why || []).join(" / "),
          match: Math.round((r.score || 0.8) * 100),
          coupon: r.coupon,
          memberOnly: r.memberOnly || false,
          image: getSpotImage(r.id),
        }));

        setRecommendations(mapped);
        setDebateLog(data.debate || []);
        setIsFetchDone(true);
      } catch (e: any) {
        if (active) {
          setApiError(e.message || "ネットワークエラーが発生しました。");
        }
      }
    }

    fetchPlan();

    return () => {
      active = false;
    };
  }, [step, likes, nopes, visitorId]);

  const handleUseCoupon = useCallback(
    (rec: Recommendation) => {
      if (user || !rec.memberOnly) {
        // ログイン済み、または「だれでもクーポン」はそのまま表示。
        setActiveCoupon(rec);
      } else {
        // 会員限定クーポンを未ログインで使う場合のみ、会員登録/ログインを促す。
        setPendingCoupon(rec);
        setAuthPrompt({ reason: "このクーポンの利用には会員登録が必要です" });
      }
    },
    [user],
  );

  // 未ログインで「行った」を押したとき、会員登録/ログインを促す。認証後に履歴へ追加する。
  const requireAuthForVisit = useCallback((spot: VisitableSpot) => {
    setPendingVisit(spot);
    setAuthPrompt({});
  }, []);

  // ホームのおすすめカードをタップ → スポット詳細を開く。
  const openSpotDetail = useCallback(
    (rec: Recommendation) => {
      setDetailVisited(isVisited(visitorId, rec.id));
      setDetailRec(rec);
    },
    [visitorId],
  );

  // 詳細モーダル内で「行った」をトグルする（未ログインかつ未訪問なら会員登録を促す）。
  const handleDetailToggleVisited = useCallback(
    (rec: Recommendation) => {
      const spot: VisitableSpot = {
        id: rec.id,
        name: rec.name,
        prefecture: rec.prefecture,
        area: rec.area,
        category: rec.category,
      };
      if (!user && !isVisited(visitorId, rec.id)) {
        requireAuthForVisit(spot);
        return;
      }
      setDetailVisited(toggleVisited(visitorId, spot));
    },
    [user, visitorId, requireAuthForVisit],
  );

  const handleSendChat = useCallback(
    async (
      spotId: string,
      text: string,
      img?: { mimeType: string; data: string } | null,
      audio?: { mimeType: string; data: string } | null,
    ) => {
      // ユーザー発言をスレッドに追加
      const userMsgText = audio ? "🎙️ 音声質問を送信しました" : text || "📸 添付画像を送信しました";
      const userMsg = { role: "user" as const, text: userMsgText };

      setChatThreads((prev) => ({
        ...prev,
        [spotId]: [
          ...(prev[spotId] || [
            {
              role: "ai",
              text: "このスポットについて、気になることや楽しみ方を聞いてみてください。写真や音声での質問も受け付けます！",
            },
          ]),
          userMsg,
        ],
      }));

      // AI「考え中…」表示を追加
      const loadingMsg = { role: "ai" as const, text: "💬 AIガイドが回答を作成中…" };
      setChatThreads((prev) => ({
        ...prev,
        [spotId]: [...(prev[spotId] || []), loadingMsg],
      }));

      try {
        const res = await fetch(`/api/v1/spots/${spotId}/ask`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: visitorId,
            text: text || "写真を解析して解説してください",
            image: img ? { mimeType: img.mimeType, data: img.data } : undefined,
            audio: audio ? { mimeType: audio.mimeType, data: audio.data } : undefined,
          }),
        });

        const data = await res.json();

        // 考え中ローディングを削除し、回答を追加
        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => m.text !== "💬 AIガイドが回答を作成中…");
          return {
            ...prev,
            [spotId]: [
              ...nextThread,
              { role: "ai" as const, text: data.answer || "回答が得られませんでした。" },
            ],
          };
        });
      } catch (e: any) {
        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => m.text !== "💬 AIガイドが回答を作成中…");
          return {
            ...prev,
            [spotId]: [
              ...nextThread,
              { role: "ai" as const, text: `エラーが発生しました: ${e.message}`, isError: true },
            ],
          };
        });
      }
    },
    [visitorId],
  );

  // ログアウト時は好み診断をリセットする（前ユーザーの結果を次の利用者に引き継がない）。
  const resetDiagnosisState = useCallback(() => {
    resetDiagnosis();
    setDiagnosisComplete(false);
    setDetailedComplete(false);
  }, []);

  const handleAuthenticated = useCallback(
    (account: UserAccount) => {
      // ログインで認証画面は役目を終える。続く画面遷移は履歴を push せず、認証エントリを
      // 置き換える（こうしないとクーポン利用後の「戻る」で再びログイン画面に戻ってしまう）。
      replaceNextRef.current = true;
      setUser(account);
      setAuthPrompt(null);
      // ログイン時は好み診断の結果を保持する（未ログインのまま診断した内容を、そのまま
      // 会員アカウントに引き継ぐ）。リセットはログアウト時のみ行う。
      if (pendingCoupon) {
        setActiveCoupon(pendingCoupon);
        setPendingCoupon(null);
      }
      if (pendingVisit) {
        markVisited(account.id, pendingVisit);
        setPendingVisit(null);
      }
      if (pendingMemoryTransition) {
        setPendingMemoryTransition(false);
        setStep("processing");
      }
    },
    [pendingCoupon, pendingVisit, pendingMemoryTransition],
  );

  // ログアウト。セッションを破棄してホームへ戻す（履歴は会員機能のため）。
  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    resetDiagnosisState();
    setStep("welcome");
  }, [resetDiagnosisState]);

  // アプリ内の「戻る/閉じる」操作はブラウザ履歴を 1 つ戻す（実際の画面復元は
  // popstate ハンドラが行う）。これによりブラウザの戻るボタンと挙動が一致し、
  // 「戻る」のたびに前進方向の履歴を積んでしまう二重化（＝戻ると飛ばされる原因）を防ぐ。
  const goBack = useCallback((fallback: Step) => {
    if (navIndexRef.current > 0) {
      window.history.back();
      return;
    }
    // 履歴の起点（リロードで深い画面に直接入った等）では戻り先がないため、
    // 明示的なフォールバック画面へ遷移し、開いているオーバーレイは閉じる。
    setDetailRec(null);
    setActiveCoupon(null);
    setAuthPrompt(null);
    setPendingCoupon(null);
    setPendingVisit(null);
    setStep(fallback);
  }, []);

  const openHistory = useCallback(() => {
    setReturnFromHistory("welcome");
    // 履歴は会員機能のため、未ログインならまずログイン画面を表示する。
    if (!user) setAuthPrompt({});
    setStep("history");
  }, [user]);

  const handleNavigate = useCallback(
    (tab: NavTab) => {
      if (tab === "search") {
        // フッターの「探す」は「あなたへのおすすめスポット」一覧を表示する。
        setStep("recommendations");
      } else if (tab === "history") {
        if (stepRef.current !== "history") {
          setReturnFromHistory(stepRef.current);
        }
        // 履歴は会員機能のため、未ログインならまずログイン画面を表示する。
        if (!user) setAuthPrompt({});
        setStep("history");
      } else {
        setStep("welcome");
      }
    },
    [user],
  );

  // 下部ナビは常時固定表示する。現在のステップに応じてアクティブなタブを切り替える。
  const footerTab: NavTab = step === "history" ? "history" : step === "welcome" ? "home" : "search";

  return (
    <PhoneShell shellRef={shellRef}>
      {step === "welcome" && (
        <WelcomeScreen
          onStartDiagnosis={beginSwipe}
          onExplore={() => setStep("recommendations")}
          onViewHistory={openHistory}
          onOpenSpot={openSpotDetail}
        />
      )}

      {step === "history" && (
        <HistoryScreen
          userId={visitorId}
          isLoggedIn={Boolean(user)}
          onRequireAuth={() => setAuthPrompt({})}
          onOpenSpot={openSpotDetail}
          onBack={() => goBack(returnFromHistory)}
          onLogout={handleLogout}
        />
      )}

      {step === "input" && (
        <InputScreen afterDiagnosis onBack={() => goBack("welcome")} onSearch={selectDestination} />
      )}

      {step === "swipe" && (
        <SwipeScreen
          key={runId}
          spots={swipeDeck}
          refine={refining}
          onComplete={handleSwipeComplete}
          onCancel={() => goBack(refining ? "recommendations" : "welcome")}
        />
      )}

      {step === "memory" && (
        <MemoryScreen
          onBack={() => goBack("input")}
          onSkipRegister={(memory) => {
            setTravelMemory(memory);
            setStep("processing");
          }}
          onGoRegister={(memory) => {
            setTravelMemory(memory);
            setPendingMemoryTransition(true);
            setAuthPrompt({ reason: "診断結果やチャット履歴を保存するには登録が必要です" });
          }}
        />
      )}

      {step === "processing" && (
        <ProcessingScreen
          count={swipedCount}
          onDone={() => {
            setDiagnosisComplete(true);
            markDiagnosisComplete();
            setStep("recommendations");
          }}
          isFetchDone={isFetchDone}
          apiError={apiError}
          onRestart={beginSwipe}
        />
      )}

      {step === "recommendations" && (
        <RecommendationsScreen
          key={visitorId}
          recommendations={recommendations}
          diagnosisComplete={diagnosisComplete}
          detailedComplete={detailedComplete}
          userId={visitorId}
          onStartDiagnosis={beginSwipe}
          onRestart={refinePreferences}
          onOpenSpot={openSpotDetail}
          debateLog={debateLog}
        />
      )}

      {/* ホーム・好み診断・目的地選択・思い出自由記述・分析中・モーダル表示中はフッターを隠す。 */}
      {step !== "welcome" &&
        step !== "swipe" &&
        step !== "input" &&
        step !== "memory" &&
        step !== "processing" &&
        !authPrompt &&
        !activeCoupon && (
          <>
            <div className="shrink-0" aria-hidden />
            <BottomNav active={footerTab} onNavigate={handleNavigate} visible={footerVisible} />
          </>
        )}

      {authPrompt && (
        <div className="fixed inset-0 z-40 flex justify-center">
          <div className="flex h-dvh w-full max-w-[600px] flex-col overflow-hidden bg-(--page)">
            <AuthScreen
              reason={authPrompt.reason}
              onAuthenticated={handleAuthenticated}
              onCancel={() => {
                if (pendingMemoryTransition) {
                  setPendingMemoryTransition(false);
                  setStep("memory");
                } else {
                  goBack("welcome");
                }
              }}
            />
          </div>
        </div>
      )}

      {activeCoupon && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="relative h-screen w-full max-w-[500px]">
            <CouponModal
              recommendation={activeCoupon}
              userName={user?.name ?? null}
              userId={visitorId}
              onClose={() => goBack("recommendations")}
            />
          </div>
        </div>
      )}

      {detailRec && (
        <SpotDetailModal
          recommendation={detailRec}
          visited={detailVisited}
          chatHistory={chatThreads[detailRec.id] || []}
          onSendChat={(text, img, audio) => handleSendChat(detailRec.id, text, img, audio)}
          onClose={() => goBack("recommendations")}
          onUseCoupon={(rec) => {
            // 認証/クーポンのオーバーレイより詳細が前面に来ないよう、先に詳細を閉じる。
            setDetailRec(null);
            handleUseCoupon(rec);
          }}
          onToggleVisited={handleDetailToggleVisited}
        />
      )}
    </PhoneShell>
  );
}
