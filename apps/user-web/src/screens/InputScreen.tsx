import { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  SearchIcon,
  XCircleIcon,
} from "../components/icons.tsx";
import {
  AVAILABLE_DESTINATIONS,
  formatDestinationSelectionLabel,
  getSelectedPrefecture,
  groupDestinationsByPrefecture,
  isSubregionFullySelected,
  searchDestinationPlaces,
  toggleDestinationSelection,
  toggleSubregionSelection,
} from "../data/places.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { useAutoResizeTextarea } from "../lib/useAutoResizeTextarea.ts";

type InputScreenProps = {
  /** 好み診断の後に表示する場合。見出し・説明文を切り替える。 */
  afterDiagnosis?: boolean;
  /** 「戻る」タップ時。 */
  onBack: () => void;
  /** 目的地を確定して検索する。 */
  onSearch: (locations: string[]) => void;
};

function formatSelectionLabel(selected: string[]): string {
  return formatDestinationSelectionLabel(selected);
}

/** フロー 2: 目的地（市区町村・都道府県）を入力する画面（frame-2-input）。 */
export function InputScreen({ afterDiagnosis = false, onBack, onSearch }: InputScreenProps) {
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsedPrefectures, setCollapsedPrefectures] = useState<Set<string>>(() => new Set());
  const location = value.trim();
  const placeMatches = afterDiagnosis
    ? AVAILABLE_DESTINATIONS
    : location.length > 0
      ? searchDestinationPlaces(location)
      : [];
  const canSearch = afterDiagnosis
    ? selected.length > 0
    : placeMatches.some((place) => place.name === location);
  const showPlaceSuggestions = !afterDiagnosis && location.length > 0;

  const inputRef = useAutoResizeTextarea({ minHeight: 24, maxHeight: 160 });

  const destinationGroups = groupDestinationsByPrefecture(
    afterDiagnosis ? AVAILABLE_DESTINATIONS : placeMatches,
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedPrefecture = useMemo(() => getSelectedPrefecture(selected), [selected]);

  const toggleDestination = (name: string) => {
    if (afterDiagnosis) {
      setSelected((prev) => toggleDestinationSelection(prev, name));
      return;
    }
    setValue(name);
  };

  const toggleSubregion = (cityNames: readonly string[]) => {
    setSelected((prev) => toggleSubregionSelection(prev, cityNames));
  };

  const togglePrefecture = (prefecture: string) => {
    setCollapsedPrefectures((prev) => {
      const next = new Set(prev);
      if (next.has(prefecture)) next.delete(prefecture);
      else next.add(prefecture);
      return next;
    });
  };

  const isPrefectureExpanded = (prefecture: string) => !collapsedPrefectures.has(prefecture);

  const renderDestinationItem = (
    place: (typeof destinationGroups)[number]["cities"][number],
    isLastItem: boolean,
  ) => {
    const isSelected = afterDiagnosis ? selectedSet.has(place.name) : place.name === location;

    return (
      <li key={place.name}>
        <button
          type="button"
          onClick={() => toggleDestination(place.name)}
          className={`flex w-full items-center gap-3 px-6 py-3.5 text-left transition active:bg-[#f1f5f9] ${
            !isLastItem ? "border-b border-[#f1f5f9]" : ""
          } ${isSelected ? "bg-[#f0fdfa]" : "bg-white"}`}
        >
          {afterDiagnosis ? (
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                isSelected
                  ? "border-[#0aa19b] bg-[#0aa19b] text-white"
                  : "border-[#cbd5e1] bg-white"
              }`}
            >
              {isSelected ? <CheckIcon className="size-3" /> : null}
            </span>
          ) : (
            <MapPinIcon className="size-4 shrink-0 text-[#94a3b8]" />
          )}
          <span
            className={`min-w-0 flex-1 text-[15px] ${
              isSelected ? "font-medium text-[#0f172a]" : "text-[#334155]"
            }`}
          >
            {place.name}
          </span>
        </button>
      </li>
    );
  };

  const renderDestinationGroups = () => {
    if (destinationGroups.length === 0) {
      return (
        <p className="px-1 py-1 text-[13px] text-[#94a3b8]">該当する地名が見つかりませんでした</p>
      );
    }

    return (
      <div className="overflow-hidden -px-4">
        {destinationGroups.map((group, groupIndex) => {
          const isLastGroup = groupIndex === destinationGroups.length - 1;
          const subregionItems = group.subregions.flatMap((subregion) => subregion.cities);
          const allItems = [...group.cities, ...subregionItems];
          const isExpanded = isPrefectureExpanded(group.prefecture);

          return (
            <section key={group.prefecture}>
              <button
                type="button"
                onClick={() => togglePrefecture(group.prefecture)}
                aria-expanded={isExpanded}
                className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-[#e2e8f0] bg-[#f8fafc]/95 px-4 py-2.5 backdrop-blur-sm text-left transition active:bg-[#f1f5f9]"
              >
                <p className="text-[12px] font-semibold tracking-wide text-[#64748b]">
                  {group.prefecture}
                </p>
                <ChevronRightIcon
                  className={`size-4 shrink-0 text-[#94a3b8] transition-transform duration-200 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>

              {isExpanded && group.cities.length > 0 && (
                <ul>
                  {group.cities.map((place, cityIndex) => {
                    const isLastItem =
                      isLastGroup &&
                      group.subregions.length === 0 &&
                      cityIndex === group.cities.length - 1;
                    return renderDestinationItem(place, isLastItem);
                  })}
                </ul>
              )}

              {isExpanded &&
                group.subregions.map((subregion, subregionIndex) => {
                  const isLastSubregion =
                    isLastGroup && subregionIndex === group.subregions.length - 1;
                  const cityNames = subregion.cities.map((place) => place.name);
                  const subregionSelected =
                    afterDiagnosis && isSubregionFullySelected(selected, cityNames);

                  return (
                    <div key={subregion.name}>
                      {afterDiagnosis ? (
                        <button
                          type="button"
                          onClick={() => toggleSubregion(cityNames)}
                          className={`flex w-full items-center gap-3 border-b border-[#f1f5f9] px-4 py-2.5 text-left transition active:bg-[#f1f5f9] ${
                            subregionSelected ? "bg-[#f0fdfa]" : "bg-[#fafbfc]"
                          }`}
                        >
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                              subregionSelected
                                ? "border-[#0aa19b] bg-[#0aa19b] text-white"
                                : "border-[#cbd5e1] bg-white"
                            }`}
                          >
                            {subregionSelected ? <CheckIcon className="size-3" /> : null}
                          </span>
                          <span
                            className={`text-[14px] font-semibold tracking-wide ${
                              subregionSelected ? "text-[#0f766e]" : "text-[#64748b]"
                            }`}
                          >
                            {subregion.name}
                          </span>
                        </button>
                      ) : (
                        <div className="border-b border-[#f1f5f9] bg-[#fafbfc] px-4 py-2 pl-6">
                          <p className="text-[11px] font-semibold tracking-wide text-[#94a3b8]">
                            {subregion.name}
                          </p>
                        </div>
                      )}
                      <ul>
                        {subregion.cities.map((place, cityIndex) => {
                          const isLastItem =
                            isLastSubregion && cityIndex === subregion.cities.length - 1;
                          return renderDestinationItem(place, isLastItem);
                        })}
                      </ul>
                    </div>
                  );
                })}

              {isExpanded && allItems.length === 0 && (
                <p className="px-4 py-3 text-[13px] text-[#94a3b8]">
                  該当する地名が見つかりませんでした
                </p>
              )}
            </section>
          );
        })}
      </div>
    );
  };

  const handleSearch = () => {
    if (!canSearch) return;
    if (afterDiagnosis) {
      onSearch(selected);
      return;
    }
    onSearch([location]);
  };

  const handleBack = () => {
    if (afterDiagnosis && selected.length > 0) {
      setSelected([]);
      setCollapsedPrefectures(new Set());
      return;
    }
    onBack();
  };

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between px-4 pt-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-[#475569] transition active:opacity-60"
          >
            <ChevronLeftIcon className="size-[18px]" />
            <span className="text-[14px]">戻る</span>
          </button>
          <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[24px] font-bold text-transparent">
            tabipla
          </p>
          <div className="w-[50px]" />
        </div>

        <div className={`flex flex-1 flex-col py-6 ${afterDiagnosis ? "min-h-0 gap-4" : "gap-6"}`}>
          <div className="shrink-0 flex flex-col px-4 gap-1">
            <p className="text-[20px] font-bold text-[#0f172a]">
              {afterDiagnosis ? "旅先を選ぶ" : "旅先を入力"}
            </p>
            <p className="text-[13px] text-[#64748b]">
              {afterDiagnosis
                ? selectedPrefecture
                  ? `${selectedPrefecture}内で複数選択できます`
                  : "行きたい地域を選んでください（同一都道府県内で複数選択可）"
                : "市区町村または都道府県名を入力してください"}
            </p>
          </div>

          <div className={`flex flex-col gap-4 ${afterDiagnosis ? "min-h-0 flex-1" : ""}`}>
            {!afterDiagnosis && (
              <div className="flex min-h-[52px] items-end gap-2.5 rounded-xl border-[1.5px] border-(--brand-from)/30 bg-white px-3 py-2.5 shadow-[0_2px_4px_rgba(10,161,155,0.03)]">
                <SearchIcon className="mb-1.5 size-5 shrink-0 text-(--brand)" />
                <div className="relative min-w-0 flex-1">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="旅先を入力"
                    className="w-full resize-none overflow-hidden bg-transparent py-0.5 text-[16px] leading-[1.4] text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1 pb-0.5">
                  {value.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setValue("")}
                      aria-label="入力をクリア"
                      className="shrink-0 text-[#94a3b8] transition active:opacity-60"
                    >
                      <XCircleIcon className="size-5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {(afterDiagnosis || showPlaceSuggestions) && renderDestinationGroups()}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t  border-[#e2e8f0] bg-white px-4 pb-8 pt-4">
        <button
          type="button"
          disabled={!canSearch}
          onClick={handleSearch}
          className={`${PRIMARY_BUTTON} h-16 leading-none flex w-full items-center justify-center gap-1.5 px-5 py-[17px] text-[16px] tracking-[1.2px]`}
        >
          {canSearch ? (
            <>
              <div>{afterDiagnosis ? formatSelectionLabel(selected) : `${location}で探す`}</div>
              <ChevronRightIcon className="size-5 mt-0.5" />
            </>
          ) : afterDiagnosis ? (
            "旅先を選んでください"
          ) : location.length > 0 ? (
            "該当する旅先がありません"
          ) : (
            "旅先を入力してください"
          )}
        </button>
      </div>
    </div>
  );
}
