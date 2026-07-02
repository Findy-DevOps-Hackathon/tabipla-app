import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneShell } from "./components/PhoneShell.tsx";
import { SpotDetailModal } from "./components/SpotDetailModal.tsx";
import { API_BASE } from "./config.ts";
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
} from "./lib/diagnosis.ts";
import {
  findRecommendationById,
  readSpotIdFromLocation,
  setSpotIdInLocation,
} from "./lib/spotLink.ts";
import { InputScreen } from "./screens/InputScreen.tsx";
import { MemoryScreen } from "./screens/MemoryScreen.tsx";
import { ProcessingScreen } from "./screens/ProcessingScreen.tsx";
import { RecommendationsScreen } from "./screens/RecommendationsScreen.tsx";
import { SwipeScreen } from "./screens/SwipeScreen.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

/** 体験フローのステップ。 */
type Step = "welcome" | "input" | "swipe" | "memory" | "processing" | "recommendations";

/** 訪問履歴・エージェント連携で使う匿名ユーザー ID（会員機能なし）。 */
const VISITOR_ID = "guest";

/** `/api/v1/personalized/plan` のレスポンス（利用フィールドのみ）。 */
type PlanApiRecommendation = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  tags?: string[];
  why?: string[];
  score?: number;
  memberOnly?: boolean;
};

type PersonalizedPlanResponse = {
  error?: string;
  recommendations?: PlanApiRecommendation[];
  profileSummary?: string;
  debate?: { agent: string; thought?: string; message: string }[];
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** リロードしても直前の画面を保つために step を保存する localStorage キー。 */
const STEP_KEY = "tabipla-step";
const STEP_VALUES: Step[] = [
  "welcome",
  "input",
  "swipe",
  "memory",
  "processing",
  "recommendations",
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

/** リロードしてもおすすめ結果を保つための localStorage キー。 */
const RECOMMENDATIONS_KEY = "tabipla-recommendations";
const PROFILE_SUMMARY_KEY = "tabipla-profile-summary";

/** 保存済みのおすすめ結果を読み出す（未保存・不正値なら空配列）。 */
function readStoredRecommendations(): Recommendation[] {
  try {
    const raw = localStorage.getItem(RECOMMENDATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Recommendation[]) : [];
  } catch {
    return [];
  }
}

/** 保存済みの好み概要を読み出す。 */
function readStoredProfileSummary(): string {
  try {
    return localStorage.getItem(PROFILE_SUMMARY_KEY) ?? "";
  } catch {
    return "";
  }
}

/** URL の ?spot= から詳細表示するスポットを復元する。 */
function readInitialDetailFromUrl(): Recommendation | null {
  const spotId = readSpotIdFromLocation();
  if (!spotId) return null;
  return findRecommendationById(spotId, readStoredRecommendations());
}

/** ブラウザ履歴と連動させるための「画面状態」のスナップショット。 */
type ViewSnapshot = {
  step: Step;
  refining: boolean;
  swipeDeck: typeof SWIPE_SPOTS;
  runId: number;
  detailRec: Recommendation | null;
}

/** 「画面（ステップ）＋開いているモーダル」を表す識別キー。 */
function viewKey(s: ViewSnapshot): string {
  <<<<<<< HEAD
  return [s.step, s.detailRec?.id ?? ""].join("|");
  =======
  return [s.step, s.detailRec?.id ?? "", s.authPrompt ? "auth" : ""].join("|");
  >>>>>>> 9f35312 ( # attachEmbedding を追加。生成失敗時は embedding なしで登録を続行する)
}

/** history.state 内に画面スナップショットを格納するためのキー。 */
const HISTORY_STATE_KEY = "tabiplaNav";

/**
 * tabipla ユーザー向け Web のメインフロー。
 *
 * ようこそ → 好み診断（スワイプ）→ 目的地選択 → 分析中 → おすすめ一覧、という
 * スワイプ型レコメンド体験をステップ状態機械で制御する（Figma デザイン準拠）。
 */
export default function App() {
  const initialDetailRec = readInitialDetailFromUrl();
  const [step, setStep] = useState<Step>(readStoredStep);
  const [, setLocation] = useState("");
  const [swipedCount, setSwipedCount] = useState(0);
  const [runId, setRunId] = useState(0);
  const [swipeDeck, setSwipeDeck] = useState<typeof SWIPE_SPOTS>(() =>
    SWIPE_SPOTS.slice(0, SWIPE_LIMIT),
  );
  const [refining, setRefining] = useState(false);
  const [diagnosisComplete, setDiagnosisComplete] = useState(isDiagnosisComplete);
  const [, setDetailedComplete] = useState(isDetailedDiagnosisComplete);

  const [likes, setLikes] = useState<string[]>([]);
  const [nopes, setNopes] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(
    readStoredRecommendations,
  );
  const [profileSummary, setProfileSummary] = useState(readStoredProfileSummary);
  const [isFetchDone, setIsFetchDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<
    Record<string, { role: "user" | "ai"; text: string; isError?: boolean; image?: string }[]>
  >({});
  const [travelMemory, setTravelMemory] = useState("");
  const [detailRec, setDetailRec] = useState<Recommendation | null>(initialDetailRec);
  const detailReturnStepRef = useRef<Step>(
    initialDetailRec ? readStoredStep() : "recommendations",
  );
  const shellRef = useRef<HTMLDivElement>(null);

  const navSnapshot: ViewSnapshot = {
    step,
    refining,
    swipeDeck,
    runId,
    detailRec,
  };
  const navSnapshotRef = useRef(navSnapshot);
  navSnapshotRef.current = navSnapshot;

  const navIndexRef = useRef(0);
  const navKeyRef = useRef<string>("");
  const isPopRef = useRef(false);

  const applySnapshot = useCallback((s: ViewSnapshot) => {
    setStep(s.step);
    setRefining(s.refining);
    setSwipeDeck(s.swipeDeck);
    setRunId(s.runId);
    setDetailRec(s.detailRec);
  }, []);

  useEffect(() => {
    const initial = navSnapshotRef.current;
    navIndexRef.current = 0;
    navKeyRef.current = viewKey(initial);
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
      if (navSnapshotRef.current.detailRec) {
        isPopRef.current = true;
        setDetailRec(null);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applySnapshot]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 画面状態の変化を検知する再実行トリガー。
  useEffect(() => {
    if (isPopRef.current) {
      isPopRef.current = false;
      return;
    }
    const snapshot = navSnapshotRef.current;
    const key = viewKey(snapshot);
    if (key === navKeyRef.current) {
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
  }, [step, refining, swipeDeck, runId, detailRec]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: step 変化時に再実行させるためのトリガー。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    try {
      localStorage.setItem(STEP_KEY, step);
    } catch {
      // localStorage 不可環境では復元を諦める。
    }
  }, [step]);

  useEffect(() => {
    try {
      localStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recommendations));
      localStorage.setItem(PROFILE_SUMMARY_KEY, profileSummary);
    } catch {
      // localStorage 不可環境では復元を諦める。
    }
  }, [recommendations, profileSummary]);

  useEffect(() => {
    if (detailRec) {
      setSpotIdInLocation(detailRec.id);
      return;
    }
    if (readSpotIdFromLocation()) {
      setSpotIdInLocation(null);
    }
  }, [detailRec]);

  const beginSwipe = useCallback(() => {
    setSwipeDeck(SWIPE_SPOTS.slice(0, SWIPE_LIMIT));
    setLikes([]);
    setNopes([]);
    setRecommendations([]);
    setProfileSummary("");
    setRefining(false);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, []);

  const selectDestination = useCallback((loc: string) => {
    setLocation(loc);
    setStep("memory");
  }, []);

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
      if (refining) {
        setDetailedComplete(true);
        markDetailedDiagnosisComplete();
      }
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
        const res = await fetch(`${API_BASE}/v1/personalized/plan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            likes,
            nopes,
            userId: VISITOR_ID,
            timeBudget: "4時間",
            origin: "小諸駅",
            travelMemory,
          }),
        });

        const data = (await res.json()) as PersonalizedPlanResponse;
        if (!active) return;

        if (!res.ok || data.error) {
          throw new Error(data.error || "プランの作成に失敗しました。");
        }

        const categoryMap: Record<string, SpotCategory> = {
          history: "歴史",
          nature: "自然",
          gourmet: "グルメ",
        };

        const findSpot = (id: string) =>
          [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE].find((sp) => sp.id === id);

        const getSpotImage = (id: string): string => {
          const s = findSpot(id);
          return s ? s.image : `${API_BASE}/img/${id}`;
        };

        const mapped: Recommendation[] = (data.recommendations ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          prefecture: "長野県",
          area: "小諸市",
          category: categoryMap[r.category ?? ""] ?? "観光",
          description: r.description || findSpot(r.id)?.description || "",
          tags: r.tags ?? [],
          reason: (r.why ?? []).join(" / "),
          match: Math.round((r.score ?? 0.8) * 100),
          memberOnly: r.memberOnly ?? false,
          image: getSpotImage(r.id),
        }));

        setRecommendations(mapped);
        setProfileSummary(data.profileSummary ?? "");
        setIsFetchDone(true);
      } catch (e: unknown) {
        if (active) {
          setApiError(getErrorMessage(e, "ネットワークエラーが発生しました。"));
        }
      }
    }

    fetchPlan();

    return () => {
      active = false;
    };
  }, [step, likes, nopes, travelMemory]);

  const openSpotDetail = useCallback(
    (rec: Recommendation) => {
      detailReturnStepRef.current = step;
      setDetailRec(rec);
    },
    [step],
  );

  const handleSendChat = useCallback(
    async (
      spotId: string,
      text: string,
      img?: { mimeType: string; data: string } | null,
      audio?: { mimeType: string; data: string } | null,
    ) => {
      const userMsgText = audio ? "🎙️ 音声質問を送信しました" : text;
      const userMsg = {
        role: "user" as const,
        text: userMsgText,
        image: img ? `data:${img.mimeType};base64,${img.data}` : undefined,
      };

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

      const loadingMsg = { role: "ai" as const, text: "💬 AIガイドが回答を作成中…" };
      setChatThreads((prev) => ({
        ...prev,
        [spotId]: [...(prev[spotId] || []), loadingMsg],
      }));

      try {
        const res = await fetch(`${API_BASE}/v1/spots/${spotId}/ask`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: VISITOR_ID,
            text: text || "写真を解析して解説してください",
            image: img ? { mimeType: img.mimeType, data: img.data } : undefined,
            audio: audio ? { mimeType: audio.mimeType, data: audio.data } : undefined,
          }),
        });

        const data = await res.json();

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
      } catch (e: unknown) {
        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => m.text !== "💬 AIガイドが回答を作成中…");
          return {
            ...prev,
            [spotId]: [
              ...nextThread,
              {
                role: "ai" as const,
                text: `エラーが発生しました: ${getErrorMessage(e, "通信に失敗しました")}`,
                isError: true,
              },
            ],
          };
        });
      }
    },
    [],
  );

  const goBack = useCallback((fallback: Step) => {
    if (navIndexRef.current > 0) {
      window.history.back();
      return;
    }
    setDetailRec(null);
    setStep(fallback);
  }, []);

  return (
    <PhoneShell shellRef={shellRef}>
      {step === "welcome" && (
        <WelcomeScreen onStartDiagnosis={beginSwipe} onOpenSpot={openSpotDetail} />
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
          onCancel={() => {
            const wasRefining = refining;
            if (wasRefining) setRefining(false);
            goBack(wasRefining ? "recommendations" : "welcome");
          }}
        />
      )}

      {step === "memory" && (
        <MemoryScreen
          onBack={() => goBack("input")}
          onContinue={(memory) => {
            setTravelMemory(memory);
            setStep("processing");
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
          recommendations={recommendations}
          diagnosisComplete={diagnosisComplete}
          userId={VISITOR_ID}
          onStartDiagnosis={beginSwipe}
          onRestart={refinePreferences}
          onGoHome={() => setStep("welcome")}
          onOpenSpot={openSpotDetail}
          profileSummary={profileSummary}
        />
      )}

      {detailRec && (
        <SpotDetailModal
          recommendation={detailRec}
          chatHistory={chatThreads[detailRec.id] || []}
          onSendChat={(text, img, audio) => handleSendChat(detailRec.id, text, img, audio)}
          onClose={() => goBack(detailReturnStepRef.current)}
        />
      )}
    </PhoneShell>
  );
}
