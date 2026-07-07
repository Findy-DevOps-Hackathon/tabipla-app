import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneShell } from "./components/PhoneShell.tsx";
import { SpotDetailModal } from "./components/SpotDetailModal.tsx";
import { API_BASE } from "./config.ts";
import { getAllSupportedDestinations, resolveTripDestinations } from "./data/places.ts";
import {
  EXPLORE_SPOTS,
  type Recommendation,
  SWIPE_LIMIT,
  SWIPE_LIMIT_REFINE,
  SWIPE_SPOTS,
  SWIPE_SPOTS_REFINE,
  type SwipeSpot,
} from "./data/spots.ts";
import {
  AI_GUIDE_LOADING_TEXT,
  formatAiGuideAnswer,
  isAiGuideLoadingMessage,
} from "./lib/aiGuide.ts";
import {
  formatDestinationLabel,
  getCurrentDestination,
  getCurrentDestinations,
  isDestinationSpot,
  setCurrentDestinations,
} from "./lib/destination.ts";
import {
  isDetailedDiagnosisComplete,
  isDiagnosisComplete,
  markDetailedDiagnosisComplete,
  markDiagnosisComplete,
} from "./lib/diagnosis.ts";
import { preloadImages } from "./lib/preloadImage.ts";
import {
  loadSpotCatalogBundle,
  planItemToRecommendation,
  refreshRecommendationImages,
  resolveSpotById,
} from "./lib/spotCatalog.ts";
import { readSpotIdFromLocation, setSpotIdInLocation } from "./lib/spotLink.ts";
import { documentToRecommendation } from "./lib/spotMapper.ts";
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
  highlights?: string[];
  prefecture?: string;
  area?: string;
  tags?: string[];
  why?: string[];
  score?: number;
  memberOnly?: boolean;
  image?: string;
  imageUrl?: string;
  address?: string;
};

type PlanItemResponse = {
  type: "spot" | "break";
  timeSlot: string;
  spot?: PlanApiRecommendation;
  title: string;
  description: string;
};

type PersonalizedPlanResponse = {
  error?: string;
  plan?: PlanItemResponse[];
  recommendations?: PlanApiRecommendation[];
  profileSummary?: string;
  result?: string;
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
    if (!Array.isArray(parsed)) return [];
    return (parsed as Recommendation[]).filter((rec) => isDestinationSpot(rec));
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

/** URL の ?spot= から詳細表示するスポット ID（非同期解決は useEffect で行う）。 */
function readInitialSpotIdFromUrl(): string | null {
  return readSpotIdFromLocation();
}

/** ブラウザ履歴と連動させるための「画面状態」のスナップショット。 */
type ViewSnapshot = {
  step: Step;
  refining: boolean;
  swipeDeck: SwipeSpot[];
  runId: number;
  detailRec: Recommendation | null;
};

/** 「画面（ステップ）＋開いているモーダル」を表す識別キー。 */
function viewKey(s: ViewSnapshot): string {
  return [s.step, s.detailRec?.id ?? ""].join("|");
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
  const initialSpotId = readInitialSpotIdFromUrl();
  const [step, setStep] = useState<Step>(readStoredStep);
  const [, setLocation] = useState("");
  const [swipedCount, setSwipedCount] = useState(0);
  const [likes, setLikes] = useState<string[]>([]);
  const [nopes, setNopes] = useState<string[]>([]);
  const [timeBudget, setTimeBudget] = useState("half");
  const [plan, setPlan] = useState<{
    type: "spot" | "break";
    timeSlot: string;
    spot?: Recommendation;
    title: string;
    description: string;
  }[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(
    readStoredRecommendations,
  );
  const [profileSummary, setProfileSummary] = useState(readStoredProfileSummary);
  const [runId, setRunId] = useState(0);
  const [catalog, setCatalog] = useState<SwipeSpot[]>([]);
  const [refineCatalog, setRefineCatalog] = useState<SwipeSpot[]>([]);
  const [exploreSpots, setExploreSpots] = useState<Recommendation[]>([]);
  const [homeFeaturedSpots, setHomeFeaturedSpots] = useState<Recommendation[]>(EXPLORE_SPOTS);
  const [swipeDeck, setSwipeDeck] = useState<SwipeSpot[]>([]);
  const [refining, setRefining] = useState(false);
  const [diagnosisComplete, setDiagnosisComplete] = useState(isDiagnosisComplete);
  const [, setDetailedComplete] = useState(isDetailedDiagnosisComplete);


  const [planMessage, setPlanMessage] = useState("");
  const [isFetchDone, setIsFetchDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<
    Record<string, { role: "user" | "ai"; text: string; isError?: boolean; image?: string }[]>
  >({});
  const [travelMemory, setTravelMemory] = useState("");
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const detailReturnStepRef = useRef<Step>(initialSpotId ? readStoredStep() : "recommendations");
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadSpotCatalogBundle(30, getAllSupportedDestinations()).then(
      ({ docs, swipeSpots, exploreSpots: loadedExploreSpots }) => {
        if (!active) return;

        const featured = loadedExploreSpots.length > 0 ? loadedExploreSpots : EXPLORE_SPOTS;
        setHomeFeaturedSpots(featured);
        setExploreSpots(featured);

        if (swipeSpots.length > 0) {
          setCatalog(swipeSpots);
          setRefineCatalog(swipeSpots);
        } else {
          setCatalog(SWIPE_SPOTS);
          setRefineCatalog([...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE]);
        }

        setRecommendations((prev) => refreshRecommendationImages(prev, docs));
        preloadImages(featured.slice(0, 3).map((spot) => spot.image));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialSpotId) return;
    let active = true;
    (async () => {
      const rec = await resolveSpotById(initialSpotId, readStoredRecommendations(), exploreSpots);
      if (active && rec) setDetailRec(rec);
    })();
    return () => {
      active = false;
    };
  }, [initialSpotId, exploreSpots]);

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
    setSwipeDeck(catalog.slice(0, SWIPE_LIMIT));
    setLikes([]);
    setNopes([]);
    setRecommendations([]);
    setProfileSummary("");
    setPlanMessage("");
    setRefining(false);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, [catalog]);

  const selectDestination = useCallback((locations: string[]) => {
    const destinations = resolveTripDestinations(locations);
    if (destinations.length > 0) {
      setCurrentDestinations(destinations);
    }
    setLocation(locations.join("、"));
    setStep("memory");
  }, []);

  const refinePreferences = useCallback(() => {
    setSwipeDeck(refineCatalog.slice(0, SWIPE_LIMIT_REFINE));
    setRefining(true);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, [refineCatalog]);

  const handleSwipeComplete = useCallback(
    (likedIds: string[], nopedIds: string[]) => {
      setLikes(likedIds);
      setNopes(nopedIds);
      setSwipedCount(likedIds.length + nopedIds.length);

      if (refining) {
        setDetailedComplete(true);
        markDetailedDiagnosisComplete();
      }
      setStep(refining ? "processing" : "input");
    },
    [refining],
  );

  useEffect(() => {
    if (step !== "processing") return;

    let active = true;
    setIsFetchDone(false);
    setApiError(null);

    async function fetchPlan() {
      try {
        const destinations = getCurrentDestinations();
        const res = await fetch(`${API_BASE}/v1/personalized/plan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            likes,
            nopes,
            userId: VISITOR_ID,
            timeBudget: timeBudget === "1day" ? "丸々一日" : timeBudget === "half" ? "半日" : "隙間時間",
            origin:
              destinations.length === 1 && destinations[0]?.area === "小諸市"
                ? "小諸駅"
                : formatDestinationLabel(destinations),
            travelMemory,
            destinations,
          }),
        });

        const data = (await res.json()) as PersonalizedPlanResponse;
        if (!active) return;

        if (!res.ok || data.error) {
          throw new Error(data.error || "プランの作成に失敗しました。");
        }

        const mapped: Recommendation[] = (data.recommendations ?? [])
          .map((r) => planItemToRecommendation(r, destinations))
          .filter((r): r is Recommendation => r !== null);

        const { docs } = await loadSpotCatalogBundle(100, destinations);
        if (!active) return;

        const primary = destinations[0] ?? getCurrentDestination();
        const finalRecommendations =
          mapped.length > 0 ? mapped : docs.map((doc) => documentToRecommendation(doc, primary));

        setRecommendations(refreshRecommendationImages(finalRecommendations, docs));

        // タイムラインプランのマッピングと保存
        const mappedPlan = (data.plan ?? []).map((item) => {
          if (item.type === "spot" && item.spot) {
            const mappedSpot = planItemToRecommendation(item.spot, destinations);
            if (mappedSpot) {
              return {
                type: "spot" as const,
                timeSlot: item.timeSlot,
                title: item.title,
                description: item.description,
                spot: refreshRecommendationImages([mappedSpot], docs)[0] || mappedSpot,
              };
            }
          }
          return {
            type: "break" as const,
            timeSlot: item.timeSlot,
            title: item.title,
            description: item.description,
          };
        });
        setPlan(mappedPlan);

        setProfileSummary(data.profileSummary ?? "");
        setPlanMessage(data.result ?? "");
        setIsFetchDone(true);
      } catch (e: unknown) {
        if (active) {
          setApiError(getErrorMessage(e, "ネットワークエラーが発生しました。"));
          setIsFetchDone(true);
        }
      }
    }

    fetchPlan();

    return () => {
      active = false;
    };
  }, [step, likes, nopes, travelMemory, timeBudget]);

  const openSpotDetail = useCallback(
    (rec: Recommendation) => {
      detailReturnStepRef.current = step;
      setDetailRec(rec);
    },
    [step],
  );

  const handleSendChat = useCallback(
    async (
      rec: Recommendation,
      text: string,
      img?: { mimeType: string; data: string } | null,
      audio?: { mimeType: string; data: string } | null,
    ) => {
      const spotId = rec.id;
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

      const loadingMsg = { role: "ai" as const, text: AI_GUIDE_LOADING_TEXT };
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
            spot: {
              name: rec.name,
              description: rec.description,
              highlights: rec.highlights ?? [],
              tags: rec.tags,
              area: rec.area,
              prefecture: rec.prefecture,
            },
          }),
        });

        const data = (await res.json()) as { answer?: string; error?: string };

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => !isAiGuideLoadingMessage(m.text));
          return {
            ...prev,
            [spotId]: [
              ...nextThread,
              {
                role: "ai" as const,
                text: formatAiGuideAnswer(data.answer || "回答が得られませんでした。"),
              },
            ],
          };
        });
      } catch (e: unknown) {
        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => !isAiGuideLoadingMessage(m.text));
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
        <WelcomeScreen
          onStartDiagnosis={beginSwipe}
          onOpenSpot={openSpotDetail}
          featuredSpots={homeFeaturedSpots}
        />
      )}

      {step === "input" && (
        <InputScreen afterDiagnosis onBack={() => goBack("welcome")} onSearch={selectDestination} />
      )}

      {step === "swipe" && (
        <SwipeScreen
          key={runId}
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
          onContinue={(memory, budget) => {
            setTravelMemory(memory);
            setTimeBudget(budget);
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
          plan={plan}
          exploreSpots={exploreSpots.length > 0 ? exploreSpots : homeFeaturedSpots}
          destinationArea={formatDestinationLabel(getCurrentDestinations())}
          diagnosisComplete={diagnosisComplete}
          userId={VISITOR_ID}
          onStartDiagnosis={beginSwipe}
          onRestart={refinePreferences}
          onGoHome={() => setStep("welcome")}
          onOpenSpot={openSpotDetail}
          profileSummary={profileSummary}
          emptyMessage={planMessage}
        />
      )}

      {detailRec && (
        <SpotDetailModal
          recommendation={detailRec}
          chatHistory={chatThreads[detailRec.id] || []}
          onSendChat={(text, img, audio) => handleSendChat(detailRec, text, img, audio)}
          onClose={() => goBack(detailReturnStepRef.current)}
        />
      )}
    </PhoneShell>
  );
}
