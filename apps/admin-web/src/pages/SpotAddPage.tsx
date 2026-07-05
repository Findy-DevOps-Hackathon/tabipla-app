import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/layout/AdminShell.tsx";
import { SegmentedControl } from "../components/ui/SegmentedControl.tsx";
import { type AddTab, useSpotAddDraft } from "../context/SpotAddDraftContext.tsx";
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
  const { lastTab, setLastTab } = useSpotAddDraft();
  const tabParam = searchParams.get("tab");
  const tab = tabParam ? parseTab(tabParam) : lastTab;

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
    <AdminShell title="観光地追加">
      <div className="px-8 py-12">
        <SegmentedControl value={tab} onChange={setTab} items={ADD_TABS} className="max-w-lg" />
      </div>
      <div hidden={tab !== "manual"}>
        <SpotFormPage embedded />
      </div>
      <div hidden={tab !== "collect"}>
        <CollectPage embedded />
      </div>
      <div hidden={tab !== "import"}>
        <BulkImportPage embedded />
      </div>
    </AdminShell>
  );
}
