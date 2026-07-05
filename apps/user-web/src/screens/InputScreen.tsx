import { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  SearchIcon,
  XCircleIcon,
} from "../components/icons.tsx";
import { AVAILABLE_DESTINATIONS, groupDestinationsByPrefecture, searchDestinationPlaces } from "../data/places.ts";
import { useAutoResizeTextarea } from "../lib/useAutoResizeTextarea.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";

type InputScreenProps = {
  /** 好み診断の後に表示する場合。見出し・説明文を切り替える。 */
  afterDiagnosis?: boolean;
  /** 「戻る」タップ時。 */
  onBack: () => void;
  /** 目的地を確定して検索する。 */
  onSearch: (location: string) => void;
};

/** フロー 2: 目的地（市区町村・都道府県）を入力する画面（frame-2-input）。 */
export function InputScreen({ afterDiagnosis = false, onBack, onSearch }: InputScreenProps) {
  const [value, setValue] = useState("");
  const location = value.trim();
  const placeMatches = afterDiagnosis
    ? AVAILABLE_DESTINATIONS
    : location.length > 0
      ? searchDestinationPlaces(location)
      : [];
  const hasDestinationMatch = placeMatches.some((place) => place.name === location);
  const canSearch = hasDestinationMatch;
  const showPlaceSuggestions = !afterDiagnosis && location.length > 0;

  const inputRef = useAutoResizeTextarea({ minHeight: 24, maxHeight: 160 });

  const destinationGroups = groupDestinationsByPrefecture(
    afterDiagnosis ? AVAILABLE_DESTINATIONS : placeMatches,
  );

  const selectDestination = (name: string) => {
    setValue(name);
  };

  const renderDestinationGroups = () => {
    if (destinationGroups.length === 0) {
      return (
        <p className="px-1 py-1 text-[13px] text-[#94a3b8]">該当する地名が見つかりませんでした</p>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {destinationGroups.map((group) => (
          <section
            key={group.prefecture}
            className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.03)]"
          >
            <div className="border-b border-[#f1f5f9] bg-[#f8fafc] px-4 py-3">
              <p className="text-[14px] font-semibold text-[#0f172a]">{group.prefecture}</p>
            </div>
            <ul>
              {group.cities.map((place) => {
                const selected = place.name === location;
                return (
                  <li key={place.name}>
                    <button
                      type="button"
                      onClick={() => selectDestination(place.name)}
                      className={`flex w-full items-center gap-2 border-b border-[#f8fafc] px-4 py-3 pl-6 text-left transition active:bg-[#f1f5f9] last:border-b-0 ${
                        selected ? "bg-[#f1f5f9]" : "bg-white"
                      }`}
                    >
                      <MapPinIcon className="size-3.5 shrink-0 text-[#94a3b8]" />
                      <span className="text-[14px] text-[#475569]">{place.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between px-4 pt-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[#475569] transition active:opacity-60"
          >
            <ChevronLeftIcon className="size-[18px]" />
            <span className="text-[14px]">戻る</span>
          </button>
          <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[20px] font-bold text-transparent">
            tabipla
          </p>
          <div className="w-[50px]" />
        </div>

        <div className="flex flex-1 flex-col gap-6 px-4 pt-6">
          <div className="flex flex-col gap-1">
            <p className="text-[20px] font-bold text-[#0f172a]">
              {afterDiagnosis ? "旅先を選ぶ" : "旅先を入力"}
            </p>
            <p className="text-[13px] text-[#64748b]">
              {afterDiagnosis
                ? "行きたい地域を選んでください"
                : "市区町村または都道府県名を入力してください"}
            </p>
          </div>

          <div className="flex flex-col gap-4">
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
                        if (canSearch) onSearch(location);
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

      <div className="flex flex-col gap-3 border-t  border-[#e2e8f0] bg-white px-4 pb-8 pt-4">
        <button
          type="button"
          disabled={!canSearch}
          onClick={() => canSearch && onSearch(location)}
          className={`${PRIMARY_BUTTON} h-16 leading-none flex w-full items-center justify-center gap-1.5 px-5 py-[17px] text-[16px] tracking-[1.2px]`}
        >
          {canSearch ? (
            <>
              <div>{location}で探す</div>
              <ChevronRightIcon className="size-5 mt-0.5" />
            </>
          ) : location.length > 0 && !hasDestinationMatch ? (
            "該当する旅先がありません"
          ) : afterDiagnosis ? (
            "旅先を選んでください"
          ) : (
            "旅先を入力してください"
          )}
        </button>
      </div>
    </div>
  );
}
