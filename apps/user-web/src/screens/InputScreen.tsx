import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  MapPinIcon,
  SearchIcon,
  XCircleIcon,
} from "../components/icons.tsx";
import { searchPlaces } from "../data/places.ts";
import { coordsToLocation, requestCurrentCoordinates } from "../lib/geolocation.ts";
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
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const location = value.trim();
  const canSearch = location.length > 0 && !locating;
  const placeMatches = location.length > 0 ? searchPlaces(location) : [];
  const showSuggestions = !locating;

  const handleUseCurrentLocation = useCallback(() => {
    // iOS Safari は「タップのハンドラ内で setState より先に同期的に geolocation を呼ぶ」
    // ことを要求するため、ここでは何より先に requestCurrentCoordinates を呼ぶ。
    let erroredSync = false;
    requestCurrentCoordinates(
      (coords) => {
        void coordsToLocation(coords)
          .then((current) => {
            setValue(current.label);
          })
          .catch(() => {
            setLocationError("現在地を取得できませんでした。");
          })
          .finally(() => {
            setLocating(false);
          });
      },
      (error) => {
        erroredSync = true;
        setLocating(false);
        setLocationError(error.message);
      },
    );

    // 同期的にエラーで終わった場合（非対応/HTTPS でない等）は、その表示を上書きしない。
    if (!erroredSync) {
      setLocationError(null);
      setLocating(true);
    }
  }, []);

  // 「目的地を選ぶ」画面（好み診断後）に来たら、ボタン操作を待たずに
  // 最初から現在地取得（＝許可ダイアログ）を自動で出す。StrictMode の二重実行や
  // 再レンダリングで何度も発火しないよう、ref で初回の一度だけに限定する。
  const autoRequestedRef = useRef(false);
  useEffect(() => {
    if (!afterDiagnosis) return;
    if (autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    handleUseCurrentLocation();
  }, [afterDiagnosis, handleUseCurrentLocation]);

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
              {afterDiagnosis ? "目的地を選ぶ" : "目的地を入力"}
            </p>
            <p className="text-[13px] text-[#64748b]">
              {afterDiagnosis
                ? locating
                  ? "現在地を取得しています。許可されると目的地に自動入力します"
                  : "好み診断が完了しました。現在地を使うか、探したい地域を選んでください"
                : "市区町村または都道府県名を入力してください"}
            </p>
          </div>

          {locationError && (
            <p className="whitespace-pre-line rounded-xl bg-[#ecececb0] px-3 py-2 text-[13px] text-[#64748b]">
              {locationError}
            </p>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex h-[52px] items-center gap-2.5 rounded-2xl border-[1.5px] border-(--brand) bg-white px-3">
              <SearchIcon className="size-5 shrink-0 text-(--brand)" />
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={locating ? "現在地を取得中…" : "目的地を入力"}
                disabled={locating}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-[#0f172a] outline-none placeholder:text-[#94a3b8] disabled:opacity-60"
              />
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

            {afterDiagnosis && (
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                className="flex h-[44px] items-center justify-center gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] text-[14px] font-medium text-[#475569] transition active:bg-[#f1f5f9] disabled:opacity-60"
              >
                <MapPinIcon className="size-4 shrink-0 text-(--brand)" />
                {locating ? "現在地を取得中…" : "現在地を使う"}
              </button>
            )}

            {showSuggestions && location.length > 0 && (
              <ul className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.03)]">
                {placeMatches.length === 0 ? (
                  <li className="px-4 py-3 text-[13px] text-[#94a3b8]">
                    該当する地名が見つかりませんでした
                  </li>
                ) : (
                  placeMatches.map((place) => {
                    const selected = place.name === location;
                    return (
                      <li key={`${place.prefecture ?? ""}-${place.name}`}>
                        <button
                          type="button"
                          onClick={() => setValue(place.name)}
                          className={`flex w-full flex-col items-start gap-0.5 border-b border-[#f8fafc] px-4 py-3 text-left transition active:bg-[#f1f5f9] ${
                            selected ? "bg-[#f1f5f9]" : "bg-white"
                          }`}
                        >
                          <span className="flex items-center gap-1 text-[14px] text-[#475569]">
                            <MapPinIcon className="size-3.5 shrink-0 text-[#94a3b8]" />
                            {place.name}
                          </span>
                          {place.prefecture && (
                            <span className="text-[11px] text-[#64748b]">{place.prefecture}</span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[#e2e8f0] bg-white px-4 pb-8 pt-4">
        <button
          type="button"
          disabled={!canSearch}
          onClick={() => canSearch && onSearch(location)}
          className={`${PRIMARY_BUTTON} h-[52px] text-[16px]`}
        >
          {canSearch ? (
            <>
              {location}で探す
              <ArrowRightIcon className="size-[18px]" />
            </>
          ) : locating ? (
            "現在地を取得中…"
          ) : (
            "目的地を入力してください"
          )}
        </button>
      </div>
    </div>
  );
}
