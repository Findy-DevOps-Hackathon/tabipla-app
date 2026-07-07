import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { SegmentedControl } from "../components/ui/SegmentedControl.tsx";
import { type AddTab, useSpotAddDraft } from "../context/SpotAddDraftContext.tsx";
import { ADMIN_TAB_BAR_CLASS } from "../lib/layout.ts";
import BulkImportPage from "./BulkImportPage.tsx";
import CollectPage from "./CollectPage.tsx";
import SpotFormPage from "./SpotFormPage.tsx";

const ADD_TABS = [
  { value: "manual" as const, label: "個別登録" },
  { value: "import" as const, label: "CSV一括登録" },
  { value: "collect" as const, label: "AI登録" },
];

function parseTab(param: string | null): AddTab {
  if (param === "collect") return "collect";
  if (param === "import") return "import";
  return "manual";
}

export default function SpotAddPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lastTab, setLastTab, collectDraft, importDraft, dataOperationBusy } = useSpotAddDraft();
  const tabParam = searchParams.get("tab");
  const tab = tabParam ? parseTab(tabParam) : lastTab;
  const wide =
    (tab === "collect" && collectDraft.step === "preview") ||
    (tab === "import" && importDraft.step === 2);
  const tabsLocked = dataOperationBusy || collectDraft.step === "registering";

  useEffect(() => {
    if (!tabParam && lastTab !== "manual") {
      setSearchParams({ tab: lastTab }, { replace: true });
    }
  }, [tabParam, lastTab, setSearchParams]);

  const setTab = (next: AddTab) => {
    setLastTab(next);
    if (next === "manual") setSearchParams({});
    else setSearchParams({ tab: next });
  };

  return (
    <AdminShell title="観光地追加" wide={wide}>
      <div className={ADMIN_TAB_BAR_CLASS}>
        <div className="w-full max-w-lg">
          <SegmentedControl value={tab} onChange={setTab} items={ADD_TABS} disabled={tabsLocked} />
        </div>
      </div>
      <div hidden={tab !== "manual"}>
        <SpotFormPage embedded />
      </div>
      <div hidden={tab !== "collect"}>
        <CollectPage />
      </div>
      <div hidden={tab !== "import"}>
        <BulkImportPage />
      </div>
    </AdminShell>
  );
}
