import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SpotCategory } from "../lib/categories.ts";
import { MUNICIPALITY } from "../master/index.ts";
import type { Spot } from "../types.ts";

export type AddTab = "manual" | "collect" | "import";

export type CollectStep = "input" | "collecting" | "preview" | "registering" | "done";

export type CollectedSpotDraft = {
  name: string;
  description: string;
  highlights: string[];
  category: string;
  area: string;
  prefecture: string;
  address: string;
  tags: string[];
  location?: { lat: number; lon: number };
  selected: boolean;
};

export type ManualFormDraft = {
  id: string;
  name: string;
  description: string;
  highlights: string;
  categories: string[];
  address: string;
  area: string;
  lat: string;
  lon: string;
};

export type ImportRowDraft = Omit<Spot, "id"> & { error?: string; line: number };

export type CollectDraft = {
  selectedCategories: SpotCategory[];
  targetCount: number;
  step: CollectStep;
  spots: CollectedSpotDraft[];
  categoryFilter: string | null;
  result: { ok: number } | null;
};

export type ImportDraft = {
  step: 1 | 2 | 3;
  rows: ImportRowDraft[];
  result: { ok: number; ng: number } | null;
};

export function emptyManualFormDraft(): ManualFormDraft {
  return {
    id: "",
    name: "",
    description: "",
    highlights: "",
    categories: [],
    address: "",
    area: MUNICIPALITY.defaultArea,
    lat: "",
    lon: "",
  };
}

export function initialCollectDraft(): CollectDraft {
  return {
    selectedCategories: [],
    targetCount: 10,
    step: "input",
    spots: [],
    categoryFilter: null,
    result: null,
  };
}

export function initialImportDraft(): ImportDraft {
  return {
    step: 1,
    rows: [],
    result: null,
  };
}

type SpotAddDraftContextValue = {
  lastTab: AddTab;
  setLastTab: (tab: AddTab) => void;
  manualDraft: ManualFormDraft;
  setManualDraft: React.Dispatch<React.SetStateAction<ManualFormDraft>>;
  resetManualDraft: () => void;
  collectDraft: CollectDraft;
  setCollectDraft: React.Dispatch<React.SetStateAction<CollectDraft>>;
  resetCollectDraft: () => void;
  importDraft: ImportDraft;
  setImportDraft: React.Dispatch<React.SetStateAction<ImportDraft>>;
};

const SpotAddDraftContext = createContext<SpotAddDraftContextValue | null>(null);

export function SpotAddDraftProvider({ children }: { children: ReactNode }) {
  const [lastTab, setLastTab] = useState<AddTab>("manual");
  const [manualDraft, setManualDraft] = useState<ManualFormDraft>(emptyManualFormDraft);
  const [collectDraft, setCollectDraft] = useState<CollectDraft>(initialCollectDraft);
  const [importDraft, setImportDraft] = useState<ImportDraft>(initialImportDraft);

  const resetManualDraft = useCallback(() => setManualDraft(emptyManualFormDraft()), []);
  const resetCollectDraft = useCallback(() => setCollectDraft(initialCollectDraft()), []);

  const value = useMemo(
    () => ({
      lastTab,
      setLastTab,
      manualDraft,
      setManualDraft,
      resetManualDraft,
      collectDraft,
      setCollectDraft,
      resetCollectDraft,
      importDraft,
      setImportDraft,
    }),
    [
      lastTab,
      manualDraft,
      collectDraft,
      importDraft,
      resetManualDraft,
      resetCollectDraft,
    ],
  );

  return <SpotAddDraftContext.Provider value={value}>{children}</SpotAddDraftContext.Provider>;
}

export function useSpotAddDraft(): SpotAddDraftContextValue {
  const ctx = useContext(SpotAddDraftContext);
  if (!ctx) {
    throw new Error("useSpotAddDraft must be used within SpotAddDraftProvider");
  }
  return ctx;
}
