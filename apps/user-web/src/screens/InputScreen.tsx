import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  MicIcon,
  StopIcon,
  SearchIcon,
  XCircleIcon,
} from "../components/icons.tsx";
import { searchPlaces } from "../data/places.ts";
import { coordsToLocation, requestCurrentCoordinates } from "../lib/geolocation.ts";
import { useAutoResizeTextarea } from "../lib/useAutoResizeTextarea.ts";
import { useSpeechRecognition } from "../lib/useSpeechRecognition.ts";
import { PRIMARY_BUTTON } from "../lib/ui.ts";
import { VoiceWaveform } from "../components/VoiceWaveform.tsx";

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
  const [speechError, setSpeechError] = useState<string | null>(null);
  /** 入力値が現在地取得（逆ジオコーディング）で自動入力されたか。 */
  const [fromCurrentLocation, setFromCurrentLocation] = useState(false);
  const location = value.trim();
  const canSearch = location.length > 0 && !locating;
  const placeMatches = location.length > 0 ? searchPlaces(location) : [];
  const showSuggestions = !locating;
  const showPlaceSuggestions =
    showSuggestions && location.length > 0 && !(fromCurrentLocation && placeMatches.length === 0);

  // showErrors=false の場合はエラーメッセージを表示しない（画面表示時の自動取得用）。
  // 「位置情報の利用が許可されていません。」等は、ユーザーが「現在地から探す」を
  // タップしたときにのみ出すため、自動取得では握りつぶす。
  const handleUseCurrentLocation = useCallback((showErrors = true) => {
    // iOS Safari は「タップのハンドラ内で setState より先に同期的に geolocation を呼ぶ」
    // ことを要求するため、ここでは何より先に requestCurrentCoordinates を呼ぶ。
    let erroredSync = false;
    requestCurrentCoordinates(
      (coords) => {
        void coordsToLocation(coords)
          .then((current) => {
            setValue(current.label);
            setFromCurrentLocation(true);
          })
          .catch(() => {
            if (showErrors) setLocationError("現在地を取得できませんでした。");
          })
          .finally(() => {
            setLocating(false);
          });
      },
      (error) => {
        erroredSync = true;
        setLocating(false);
        if (showErrors) setLocationError(error.message);
      },
    );

    // 同期的にエラーで終わった場合（非対応/HTTPS でない等）は、その表示を上書きしない。
    if (!erroredSync) {
      setLocationError(null);
      setLocating(true);
    }
  }, []);

  const valueRef = useRef(value);
  valueRef.current = value;

  const { supported: speechSupported, listening, audioLevels, start: startSpeech, stop: stopSpeech } =
    useSpeechRecognition({
    getBaseText: () => valueRef.current,
    onTranscript: (text) => {
      setValue(text);
      setFromCurrentLocation(false);
      setSpeechError(null);
      setLocationError(null);
    },
    onError: (message) => setSpeechError(message),
  });

  // 「目的地を選ぶ」画面（好み診断後）に来たら、ボタン操作を待たずに
  // 最初から現在地取得（＝許可ダイアログ）を自動で出す。StrictMode の二重実行や
  // 再レンダリングで何度も発火しないよう、ref で初回の一度だけに限定する。
  const autoRequestedRef = useRef(false);
  useEffect(() => {
    if (!afterDiagnosis) return;
    if (autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    // 自動取得では許可拒否などのエラーを表示しない（タップ時のみ表示する）。
    handleUseCurrentLocation(false);
  }, [afterDiagnosis, handleUseCurrentLocation]);

  const inputRef = useAutoResizeTextarea({ minHeight: 24, maxHeight: 160 });

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
                ? locating
                  ? "現在地を取得しています。許可されると目的地に自動入力します"
                  : "現在地を使うか、探したい地域を入力してください"
                : "市区町村または都道府県名を入力してください"}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex min-h-[52px] items-end gap-2.5 rounded-xl border-[1.5px] border-(--brand-from)/30 bg-white px-3 py-2.5 shadow-[0_2px_4px_rgba(10,161,155,0.03)]">
              <SearchIcon className="mb-1.5 size-5 shrink-0 text-(--brand)" />
              <div className="relative min-w-0 flex-1">
                {listening && (
                  <div
                    className="flex min-h-[28px] items-center gap-2.5 py-0.5"
                    aria-live="polite"
                  >
                    <VoiceWaveform levels={audioLevels} maxHeight={24} />
                    <span className="text-[14px] text-[#94a3b8]">聞いています…</span>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setFromCurrentLocation(false);
                    setLocationError(null);
                    setSpeechError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canSearch) onSearch(location);
                    }
                  }}
                  placeholder={
                    locating ? "現在地を取得中…" : listening ? "話しかけてください…" : "旅先を入力"
                  }
                  disabled={locating || listening}
                  aria-hidden={listening}
                  tabIndex={listening ? -1 : 0}
                  className={`w-full resize-none overflow-hidden bg-transparent py-0.5 text-[16px] leading-[1.4] text-[#0f172a] outline-none placeholder:text-[#94a3b8] disabled:opacity-60 ${
                    listening ? "pointer-events-none absolute inset-0 opacity-0" : ""
                  }`}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 pb-0.5">
              {speechSupported &&
                (listening ? (
                  <button
                    type="button"
                    onClick={stopSpeech}
                    aria-label="停止"
                    className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-rose-500 px-2.5 text-white transition active:opacity-80"
                  >
                    <StopIcon className="size-3.5" />
                    <span className="text-[12px] font-semibold">停止</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startSpeech}
                    disabled={locating}
                    aria-label="音声で入力"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#94a3b8] transition active:opacity-60 disabled:opacity-40"
                  >
                    <MicIcon className="size-4" />
                  </button>
                ))}
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("");
                    setFromCurrentLocation(false);
                  }}
                  aria-label="入力をクリア"
                  className="shrink-0 text-[#94a3b8] transition active:opacity-60"
                >
                  <XCircleIcon className="size-5" />
                </button>
              )}
              </div>
            </div>
            {speechError && (
              <p className="whitespace-pre-line rounded-xl bg-[#ecececb0] px-3 py-2 text-[13px] text-[#64748b]">
                {speechError}
              </p>
            )}
            {afterDiagnosis && (
              <button
                type="button"
                onClick={() => handleUseCurrentLocation(true)}
                disabled={locating}
                className="flex h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-(--brand-from)/30 bg-white text-[14px] font-semibold text-[#94a3b8] transition active:bg-[#f1f5f9] disabled:opacity-60 shadow-[0_3px_6px_rgba(10,161,155,0.03)]"
              >
                <MapPinIcon className="size-5 shrink-0 text-[#94a3b8]" />
                {locating ? "現在地を取得中…" : "現在地から探す"}
              </button>
            )}
            {locationError && (
              <p className="whitespace-pre-line rounded-xl bg-[#ecececb0] px-3 py-2 text-[13px] text-[#64748b]">
                {locationError}
              </p>
            )}

            {showPlaceSuggestions &&
              (placeMatches.length === 0 ? (
                <ul className="px-1 py-1">
                  <li className="text-[13px] text-[#94a3b8]">該当する地名が見つかりませんでした</li>
                </ul>
              ) : (
                <ul className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.03)]">
                  {placeMatches.map((place) => {
                    const selected = place.name === location;
                    return (
                      <li key={`${place.prefecture ?? ""}-${place.name}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setValue(place.name);
                            setFromCurrentLocation(false);
                          }}
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
                  })}
                </ul>
              ))}
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
          ) : locating ? (
            "現在地を取得中…"
          ) : (
            "旅先を入力してください"
          )}
        </button>
      </div>
    </div>
  );
}
