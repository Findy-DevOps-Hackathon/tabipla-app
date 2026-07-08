import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneShell } from "./components/PhoneShell.tsx";
import { SpotDetailModal } from "./components/SpotDetailModal.tsx";
import { API_BASE } from "./config.ts";
import {
  getAllSupportedDestinations,
  readQrDestinationNamesFromLocation,
  resolveTripDestinations,
} from "./data/places.ts";
import {
  EXPLORE_SPOTS,
  RECOMMENDATIONS_PAGE_SIZE,
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
import { isSystemFacingError, sanitizeUserFacingError } from "./lib/planError.ts";
import { preloadImages } from "./lib/preloadImage.ts";
import { type FlowStep, readFlowSession, writeFlowSession } from "./lib/session.ts";
import {
  loadSpotCatalogBundle,
  planItemToRecommendation,
  refreshRecommendationImages,
  resolveSpotById,
} from "./lib/spotCatalog.ts";
import { readSpotIdFromLocation, setSpotIdInLocation } from "./lib/spotLink.ts";
import { InputScreen } from "./screens/InputScreen.tsx";
import { MemoryScreen } from "./screens/MemoryScreen.tsx";
import { ProcessingScreen } from "./screens/ProcessingScreen.tsx";
import { RecommendationsScreen } from "./screens/RecommendationsScreen.tsx";
import { SwipeScreen } from "./screens/SwipeScreen.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

/** `/api/v1/personalized/plan` のレスポンス（利用フィールドのみ）。 */
type PlanApiRecommendation = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  highlights?: string[];
  prefecture?: string;
  area?: string;
  score?: number;
  image?: string;
  imageUrl?: string;
  address?: string;
};

type PersonalizedPlanResponse = {
  error?: string;
  profileSummary?: string;
  recommendations?: PlanApiRecommendation[];
  result?: string;
  needsRefinement?: boolean;
  total?: number;
  page?: number;
  limit?: number;
  planKey?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 匿名ユーザー向け user-web の体験フロー。 */
type Step = FlowStep;

/** リロードしてもおすすめ結果を保つための localStorage キー。 */
const RECOMMENDATIONS_KEY = "tabipla-recommendations";
const PLAN_MESSAGE_KEY = "tabipla-plan-message";
const PLAN_PROFILE_SUMMARY_KEY = "tabipla-plan-profile-summary";
const PLAN_TOTAL_KEY = "tabipla-plan-total";
const QR_ENTRY_SESSION_KEY = "tabipla-qr-entry-url";

function readInitialQrDestinationNames(): string[] {
  const names = readQrDestinationNamesFromLocation();
  if (names.length === 0) return [];

  try {
    const currentUrl = window.location.href;
    if (sessionStorage.getItem(QR_ENTRY_SESSION_KEY) === currentUrl) return [];
    sessionStorage.setItem(QR_ENTRY_SESSION_KEY, currentUrl);
  } catch {
    // sessionStorage 不可環境では QR の初期化を通常通り適用する。
  }

  return names;
}

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

/** 保存済みの AI 紹介文を読み出す。 */
function readStoredPlanMessage(): string {
  try {
    return localStorage.getItem(PLAN_MESSAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 保存済みの好み分析サマリーを読み出す。 */
function readStoredPlanProfileSummary(): string {
  try {
    return localStorage.getItem(PLAN_PROFILE_SUMMARY_KEY) ?? "";
  } catch {
    return "";
  }
}

function readStoredPlanTotal(): number {
  try {
    const raw = localStorage.getItem(PLAN_TOTAL_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
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

function resolveSwipeDeckFromIds(
  ids: string[],
  isRefining: boolean,
  catalog: SwipeSpot[],
  refineCatalog: SwipeSpot[],
): SwipeSpot[] {
  const fallback = isRefining ? [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE] : SWIPE_SPOTS;
  const pool =
    (isRefining ? refineCatalog : catalog).length > 0
      ? isRefining
        ? refineCatalog
        : catalog
      : fallback;
  const limit = isRefining ? SWIPE_LIMIT_REFINE : SWIPE_LIMIT;

  if (ids.length > 0) {
    const restored = ids
      .map((id) => pool.find((spot) => spot.id === id))
      .filter((spot): spot is SwipeSpot => spot !== undefined);
    if (restored.length >= 2) return restored;
  }

  return pool.slice(0, limit);
}

/**
 * tabipla ユーザー向け Web のメインフロー。
 *
 * ようこそ → 好み診断（比較選択）→ 目的地選択 → 分析中 → おすすめ一覧、という
 * レコメンド体験をステップ状態機械で制御する（Figma デザイン準拠）。
 */
export default function App() {
  const initialFlow = readFlowSession();
  const [initialQrDestinationNames] = useState(readInitialQrDestinationNames);
  const initialSelectedDestinationNames =
    initialQrDestinationNames.length > 0
      ? initialQrDestinationNames
      : initialFlow.selectedDestinationNames;
  const initialQrPreferredPrefecture =
    resolveTripDestinations(initialQrDestinationNames)[0]?.prefecture ?? null;
  const initialSpotId = readInitialSpotIdFromUrl();
  const [step, setStep] = useState<Step>(
    initialQrDestinationNames.length > 0 ? "welcome" : initialFlow.step,
  );
  const [, setLocation] = useState("");
  const [swipedCount, setSwipedCount] = useState(initialFlow.swipedCount);
  const [runId, setRunId] = useState(initialFlow.runId);
  const [catalog, setCatalog] = useState<SwipeSpot[]>([]);
  const [refineCatalog, setRefineCatalog] = useState<SwipeSpot[]>([]);
  const [exploreSpots, setExploreSpots] = useState<Recommendation[]>([]);
  const [homeFeaturedSpots, setHomeFeaturedSpots] = useState<Recommendation[]>(EXPLORE_SPOTS);
  const [swipeDeck, setSwipeDeck] = useState<SwipeSpot[]>([]);
  const [refining, setRefining] = useState(initialFlow.refining);
  const [diagnosisComplete, setDiagnosisComplete] = useState(isDiagnosisComplete);
  const [, setDetailedComplete] = useState(isDetailedDiagnosisComplete);

  const [likes, setLikes] = useState<string[]>(initialFlow.likes);
  const [likeWeights, setLikeWeights] = useState<Record<string, number>>(initialFlow.likeWeights);
  const [nopes, setNopes] = useState<string[]>(initialFlow.nopes);
  const [recommendations, setRecommendations] =
    useState<Recommendation[]>(readStoredRecommendations);
  const [planMessage, setPlanMessage] = useState(readStoredPlanMessage);
  const [planProfileSummary, setPlanProfileSummary] = useState(readStoredPlanProfileSummary);
  const [planTotal, setPlanTotal] = useState(readStoredPlanTotal);
  const [planPage, setPlanPage] = useState(1);
  const [planKey, setPlanKey] = useState(initialFlow.planKey);
  const planKeyRef = useRef(planKey);
  planKeyRef.current = planKey;
  const [planLoadingMore, setPlanLoadingMore] = useState(false);
  const [isFetchDone, setIsFetchDone] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [planFetchKey, setPlanFetchKey] = useState(0);
  const [planNeedsRefinement, setPlanNeedsRefinement] = useState(false);
  const [chatThreads, setChatThreads] = useState<
    Record<string, { role: "user" | "ai"; text: string; isError?: boolean; image?: string }[]>
  >({});
  const [travelMemory, setTravelMemory] = useState(initialFlow.travelMemory);
  const [selectedDestinationNames, setSelectedDestinationNames] = useState(
    initialSelectedDestinationNames,
  );
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const detailReturnStepRef = useRef<Step>(initialSpotId ? initialFlow.step : "recommendations");
  const pendingSwipeDeckIdsRef = useRef(initialFlow.swipeDeckIds);
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
    if (initialQrDestinationNames.length === 0) return;
    const destinations = resolveTripDestinations(initialQrDestinationNames);
    if (destinations.length > 0) {
      setCurrentDestinations(destinations);
    }
  }, [initialQrDestinationNames]);

  useEffect(() => {
    if (step !== "swipe" || swipeDeck.length > 0) return;
    if (catalog.length === 0 && refineCatalog.length === 0) return;

    const restored = resolveSwipeDeckFromIds(
      pendingSwipeDeckIdsRef.current,
      refining,
      catalog,
      refineCatalog,
    );
    pendingSwipeDeckIdsRef.current = [];

    if (restored.length >= 2) {
      setSwipeDeck(restored);
      return;
    }

    setStep(refining && isDiagnosisComplete() ? "recommendations" : "welcome");
  }, [step, swipeDeck.length, catalog, refineCatalog, refining]);

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
    writeFlowSession({
      step,
      likes,
      nopes,
      likeWeights,
      travelMemory,
      refining,
      swipedCount,
      runId,
      swipeDeckIds: swipeDeck.map((spot) => spot.id),
      selectedDestinationNames,
      planKey,
    });
  }, [
    step,
    likes,
    nopes,
    likeWeights,
    travelMemory,
    refining,
    swipedCount,
    runId,
    swipeDeck,
    selectedDestinationNames,
    planKey,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(RECOMMENDATIONS_KEY, JSON.stringify(recommendations));
      localStorage.setItem(PLAN_MESSAGE_KEY, planMessage);
      localStorage.setItem(PLAN_PROFILE_SUMMARY_KEY, planProfileSummary);
      localStorage.setItem(PLAN_TOTAL_KEY, String(planTotal));
    } catch {
      // localStorage 不可環境では復元を諦める。
    }
  }, [recommendations, planMessage, planProfileSummary, planTotal]);

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
    const pool = catalog.length > 0 ? catalog : SWIPE_SPOTS;
    pendingSwipeDeckIdsRef.current = [];
    setSwipeDeck(pool.slice(0, SWIPE_LIMIT));
    setLikes([]);
    setLikeWeights({});
    setNopes([]);
    setRecommendations([]);
    setPlanMessage("");
    setPlanProfileSummary("");
    setPlanTotal(0);
    setPlanPage(1);
    setPlanKey("");
    planKeyRef.current = "";
    setRefining(false);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, [catalog]);

  const selectDestination = useCallback((locations: string[]) => {
    const destinations = resolveTripDestinations(locations);
    if (destinations.length > 0) {
      setCurrentDestinations(destinations);
    }
    setSelectedDestinationNames(locations);
    setLocation(locations.join("、"));
    setStep("memory");
  }, []);

  const refinePreferences = useCallback(() => {
    const pool = refineCatalog.length > 0 ? refineCatalog : [...SWIPE_SPOTS, ...SWIPE_SPOTS_REFINE];
    pendingSwipeDeckIdsRef.current = [];
    setPlanNeedsRefinement(false);
    setSwipeDeck(pool.slice(0, SWIPE_LIMIT_REFINE));
    setRefining(true);
    setRunId((id) => id + 1);
    setStep("swipe");
  }, [refineCatalog]);

  const handleSwipeComplete = useCallback(
    ({ likedIds, wins }: { likedIds: string[]; wins: Record<string, number> }) => {
      setLikes((prev) => {
        const next = [...prev];
        for (const id of likedIds) {
          if (!next.includes(id)) next.push(id);
        }
        return next;
      });

      setLikeWeights((prev) => {
        const next = { ...prev };
        for (const id of likedIds) {
          next[id] = (next[id] ?? 0) + Math.max(1, wins[id] ?? 1);
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

  const fetchPlanPage = useCallback(
    async (page: number, append: boolean) => {
      const destinations = getCurrentDestinations();
      const currentPlanKey = planKeyRef.current;
      const res = await fetch(`${API_BASE}/v1/personalized/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          likes,
          nopes,
          likeWeights,
          travelMemory,
          destinations,
          page,
          limit: RECOMMENDATIONS_PAGE_SIZE,
          ...(currentPlanKey ? { planKey: currentPlanKey } : {}),
        }),
      });

      const data = (await res.json()) as PersonalizedPlanResponse;

      if (!res.ok || data.error) {
        throw new Error(data.error || "おすすめの作成に失敗しました。");
      }

      const mapped: Recommendation[] = (data.recommendations ?? [])
        .map((r) => planItemToRecommendation(r, destinations))
        .filter((r): r is Recommendation => r !== null);

      const { docs } = await loadSpotCatalogBundle(100, destinations);
      const refreshed = refreshRecommendationImages(mapped, docs);

      setRecommendations((prev) => (append ? [...prev, ...refreshed] : refreshed));
      setPlanTotal(data.total ?? refreshed.length);
      setPlanPage(data.page ?? page);
      if (data.planKey) {
        planKeyRef.current = data.planKey;
        setPlanKey(data.planKey);
      }
      if (!append && data.result) {
        setPlanMessage(data.result);
      }
      if (!append) {
        setPlanProfileSummary(data.profileSummary ?? "");
        setPlanNeedsRefinement(Boolean(data.needsRefinement));
      }
    },
    [likes, likeWeights, nopes, travelMemory],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: step / planFetchKey の変化時のみ初回取得する。
  useEffect(() => {
    if (step !== "processing") return;

    let active = true;
    setIsFetchDone(false);
    setApiError(null);
    setPlanPage(1);
    setPlanNeedsRefinement(false);
    planKeyRef.current = "";
    setPlanKey("");

    async function fetchPlan() {
      try {
        await fetchPlanPage(1, false);
        if (!active) return;
        setIsFetchDone(true);
      } catch (e: unknown) {
        if (active) {
          setApiError(getErrorMessage(e, "おすすめの作成に失敗しました。"));
          setIsFetchDone(true);
        }
      }
    }

    fetchPlan();

    return () => {
      active = false;
    };
  }, [step, planFetchKey]);

  // ステート更新前に同一クロージャから複数回呼ばれるのを防ぐための同期ガード。
  const planLoadingMoreRef = useRef(false);

  const loadMoreRecommendations = useCallback(async () => {
    if (planLoadingMoreRef.current || recommendations.length >= planTotal) return;

    planLoadingMoreRef.current = true;
    setPlanLoadingMore(true);
    try {
      await fetchPlanPage(planPage + 1, true);
    } catch {
      // 追加読み込み失敗時はサイレント（一覧は維持）
    } finally {
      planLoadingMoreRef.current = false;
      setPlanLoadingMore(false);
    }
  }, [fetchPlanPage, planPage, planTotal, recommendations.length]);

  const retryPlanFetch = useCallback(() => {
    setApiError(null);
    setIsFetchDone(false);
    setPlanFetchKey((key) => key + 1);
  }, []);

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
            text: text || "写真を解析して解説してください",
            image: img ? { mimeType: img.mimeType, data: img.data } : undefined,
            audio: audio ? { mimeType: audio.mimeType, data: audio.data } : undefined,
            userProfileSummary: planProfileSummary || undefined,
            spot: {
              name: rec.name,
              description: rec.description,
              highlights: rec.highlights ?? [],
              area: rec.area,
              prefecture: rec.prefecture,
            },
          }),
        });

        const data = (await res.json()) as { answer?: string; error?: string };

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const rawAnswer = data.answer || "回答が得られませんでした。";
        const answerIsSystemError = isSystemFacingError(rawAnswer);
        const answerText = answerIsSystemError
          ? sanitizeUserFacingError(rawAnswer, "chat")
          : formatAiGuideAnswer(rawAnswer);

        setChatThreads((prev) => {
          const thread = [...(prev[spotId] || [])];
          const nextThread = thread.filter((m) => !isAiGuideLoadingMessage(m.text));
          return {
            ...prev,
            [spotId]: [
              ...nextThread,
              {
                role: "ai" as const,
                text: answerText,
                isError: answerIsSystemError,
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
                text: sanitizeUserFacingError(getErrorMessage(e, "通信に失敗しました"), "chat"),
                isError: true,
              },
            ],
          };
        });
      }
    },
    [planProfileSummary],
  );

  const goBack = useCallback(
    (fallback: Step) => {
      if (navIndexRef.current > 0) {
        window.history.back();
        return;
      }

      const snapshot: ViewSnapshot = {
        ...navSnapshotRef.current,
        step: fallback,
        detailRec: null,
      };
      navKeyRef.current = viewKey(snapshot);
      isPopRef.current = true;
      navIndexRef.current = 0;
      applySnapshot(snapshot);
      window.history.replaceState({ [HISTORY_STATE_KEY]: { idx: 0, snapshot } }, "");
    },
    [applySnapshot],
  );

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
        <InputScreen
          afterDiagnosis
          initialSelected={selectedDestinationNames}
          preferredPrefecture={initialQrPreferredPrefecture}
          onSelectedChange={setSelectedDestinationNames}
          onBack={() => goBack("swipe")}
          onSearch={selectDestination}
        />
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
          needsRefinement={planNeedsRefinement && !refining}
          interpretationMessage={planMessage}
          onRefineMore={refinePreferences}
          onRetry={retryPlanFetch}
          onRestart={beginSwipe}
          onGoBack={() => setStep(refining ? "recommendations" : "memory")}
          goBackLabel={refining ? "おすすめ一覧に戻る" : "入力内容を変更する"}
        />
      )}

      {step === "recommendations" && (
        <RecommendationsScreen
          recommendations={recommendations}
          exploreSpots={exploreSpots.length > 0 ? exploreSpots : homeFeaturedSpots}
          destinationArea={formatDestinationLabel(getCurrentDestinations())}
          diagnosisComplete={diagnosisComplete}
          onStartDiagnosis={beginSwipe}
          onRestart={refinePreferences}
          onGoHome={() => setStep("welcome")}
          onOpenSpot={openSpotDetail}
          aiIntroMessage={planMessage}
          preferenceSummary={planProfileSummary}
          hasMoreRecommendations={diagnosisComplete && recommendations.length < planTotal}
          loadingMoreRecommendations={planLoadingMore}
          onLoadMoreRecommendations={loadMoreRecommendations}
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
