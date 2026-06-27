import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, logout, type UserAccount } from "./auth.ts";
import { BottomNav, type NavTab } from "./components/BottomNav.tsx";
import { CouponModal } from "./components/CouponModal.tsx";
import { PhoneShell } from "./components/PhoneShell.tsx";
import { SpotDetailModal } from "./components/SpotDetailModal.tsx";
import {
  RECOMMENDATIONS,
  type Recommendation,
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
import { ProcessingScreen } from "./screens/ProcessingScreen.tsx";
import { RecommendationsScreen } from "./screens/RecommendationsScreen.tsx";
import { SwipeScreen } from "./screens/SwipeScreen.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

/** 体験フローのステップ。 */
type Step = "welcome" | "input" | "swipe" | "processing" | "recommendations" | "history";

/** リロードしても直前の画面を保つために step を保存する localStorage キー。 */
const STEP_KEY = "tabipla-step";
const STEP_VALUES: Step[] = [
  "welcome",
  "input",
  "swipe",
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
    setRefining(false);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, []);

  const selectDestination = useCallback((loc: string) => {
    setLocation(loc);
    setStep("processing");
  }, []);

  // 「好みをより詳しく設定する」: 追加デッキ（10件）で好き嫌いをさらに振り分ける。
  const refinePreferences = useCallback(() => {
    setSwipeDeck(SWIPE_SPOTS_REFINE.slice(0, SWIPE_LIMIT_REFINE));
    setRefining(true);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, []);

  const handleSwipeComplete = useCallback(() => {
    setSwipedCount(swipeDeck.length);
    // 深掘り（10件）を一度完了したら、以降は「好みをより詳しく設定する」を出さない。
    if (refining) {
      setDetailedComplete(true);
      markDetailedDiagnosisComplete();
    }
    // 初回は目的地をまだ選んでいないので入力画面へ。深掘り時は目的地確定済みなので分析へ。
    setStep(refining ? "processing" : "input");
  }, [refining, swipeDeck.length]);

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

  // ログイン/ログアウト時は好み診断をリセットする（前ユーザーの結果を引き継がない）。
  const resetDiagnosisState = useCallback(() => {
    resetDiagnosis();
    setDiagnosisComplete(false);
    setDetailedComplete(false);
  }, []);

  const handleAuthenticated = useCallback(
    (account: UserAccount) => {
      setUser(account);
      setAuthPrompt(null);
      resetDiagnosisState();
      if (pendingCoupon) {
        setActiveCoupon(pendingCoupon);
        setPendingCoupon(null);
      }
      if (pendingVisit) {
        markVisited(account.id, pendingVisit);
        setPendingVisit(null);
      }
    },
    [pendingCoupon, pendingVisit, resetDiagnosisState],
  );

  // ログアウト。セッションを破棄してホームへ戻す（履歴は会員機能のため）。
  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    resetDiagnosisState();
    setStep("welcome");
  }, [resetDiagnosisState]);

  const closeAuthPrompt = useCallback(() => {
    setAuthPrompt(null);
    setPendingCoupon(null);
    setPendingVisit(null);
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
          onViewHistory={openHistory}
          onOpenSpot={openSpotDetail}
        />
      )}

      {step === "history" && (
        <HistoryScreen
          userId={visitorId}
          isLoggedIn={Boolean(user)}
          onRequireAuth={() => setAuthPrompt({})}
          onBack={() => setStep(returnFromHistory)}
          onLogout={handleLogout}
        />
      )}

      {step === "input" && (
        <InputScreen
          afterDiagnosis
          onBack={() => setStep("welcome")}
          onSearch={selectDestination}
        />
      )}

      {step === "swipe" && (
        <SwipeScreen
          key={runId}
          spots={swipeDeck}
          refine={refining}
          onComplete={handleSwipeComplete}
          onCancel={() => setStep(refining ? "recommendations" : "welcome")}
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
        />
      )}

      {step === "recommendations" && (
        <RecommendationsScreen
          key={visitorId}
          recommendations={RECOMMENDATIONS}
          diagnosisComplete={diagnosisComplete}
          detailedComplete={detailedComplete}
          userId={visitorId}
          isLoggedIn={Boolean(user)}
          onRequireAuthForVisit={requireAuthForVisit}
          onStartDiagnosis={beginSwipe}
          onRestart={refinePreferences}
          onUseCoupon={handleUseCoupon}
        />
      )}

      {/* ホーム・好み診断・目的地選択・分析中・モーダル表示中はフッターを隠す。 */}
      {step !== "welcome" &&
        step !== "swipe" &&
        step !== "input" &&
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
              onCancel={closeAuthPrompt}
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
              onClose={() => setActiveCoupon(null)}
            />
          </div>
        </div>
      )}

      {detailRec && (
        <SpotDetailModal
          recommendation={detailRec}
          visited={detailVisited}
          onClose={() => setDetailRec(null)}
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
