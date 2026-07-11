/** リロード後も診断フローを復元するためのクライアント状態。 */
export type FlowStep = "welcome" | "input" | "swipe" | "memory" | "processing" | "recommendations";

export type FlowSession = {
  step: FlowStep;
  likes: string[];
  nopes: string[];
  likeWeights: Record<string, number>;
  travelMemory: string;
  refining: boolean;
  comparisonCount: number;
  runId: number;
  swipeDeckIds: string[];
  selectedDestinationNames: string[];
  planKey: string;
};

const FLOW_SESSION_KEY = "tabipla-flow-session";
const LEGACY_STEP_KEY = "tabipla-step";

const FLOW_STEPS: FlowStep[] = [
  "welcome",
  "input",
  "swipe",
  "memory",
  "processing",
  "recommendations",
];

const DEFAULT_SESSION: FlowSession = {
  step: "welcome",
  likes: [],
  nopes: [],
  likeWeights: {},
  travelMemory: "",
  refining: false,
  comparisonCount: 0,
  runId: 0,
  swipeDeckIds: [],
  selectedDestinationNames: [],
  planKey: "",
};

function readLegacyStep(): FlowStep {
  try {
    const raw = localStorage.getItem(LEGACY_STEP_KEY);
    if (raw && (FLOW_STEPS as string[]).includes(raw)) {
      return raw as FlowStep;
    }
  } catch {
    // localStorage 不可環境では既定値を使う。
  }
  return "welcome";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeLikeWeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, number> = {};
  for (const [key, weight] of Object.entries(value as Record<string, unknown>)) {
    if (typeof weight === "number" && Number.isFinite(weight)) {
      next[key] = weight;
    }
  }
  return next;
}

function normalizeSession(value: unknown): FlowSession {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SESSION, step: readLegacyStep() };
  }

  const raw = value as Partial<FlowSession>;
  const step =
    raw.step && (FLOW_STEPS as string[]).includes(raw.step) ? raw.step : readLegacyStep();

  return {
    step,
    likes: normalizeStringArray(raw.likes),
    nopes: normalizeStringArray(raw.nopes),
    likeWeights: normalizeLikeWeights(raw.likeWeights),
    travelMemory: typeof raw.travelMemory === "string" ? raw.travelMemory : "",
    refining: raw.refining === true,
    comparisonCount:
      typeof raw.comparisonCount === "number" && raw.comparisonCount >= 0
        ? raw.comparisonCount
        : typeof raw.swipedCount === "number" && raw.swipedCount >= 0
          ? raw.swipedCount
          : 0,
    runId: typeof raw.runId === "number" && raw.runId >= 0 ? raw.runId : 0,
    swipeDeckIds: normalizeStringArray(raw.swipeDeckIds),
    selectedDestinationNames: normalizeStringArray(raw.selectedDestinationNames),
    planKey: typeof raw.planKey === "string" ? raw.planKey : "",
  };
}

/** 保存済みの診断フロー状態を読み出す。 */
export function readFlowSession(): FlowSession {
  try {
    const raw = localStorage.getItem(FLOW_SESSION_KEY);
    if (!raw) {
      return { ...DEFAULT_SESSION, step: readLegacyStep() };
    }
    return normalizeSession(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SESSION, step: readLegacyStep() };
  }
}

/** 診断フロー状態を保存する。 */
export function writeFlowSession(session: FlowSession): void {
  try {
    localStorage.setItem(FLOW_SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LEGACY_STEP_KEY, session.step);
  } catch {
    // localStorage 不可環境では復元を諦める。
  }
}
