import { Crop, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { SPOT_IMAGE_ACCEPT, spotImageBase64ToFile } from "../api.ts";
import type { CollectedSpotDraft } from "../context/SpotAddDraftContext.tsx";
import { useSpotImageCropPicker } from "../hooks/useSpotImageCropPicker.tsx";

type CollectSpotImageCellProps = {
  spot: CollectedSpotDraft;
  busy: "generate" | "upload" | null;
  disabled?: boolean;
  className?: string;
  onGenerate: () => void;
  onCancelGenerate?: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
};

/** AI 収集プレビュー用: 枠内 UPLOAD → アップロード後にイラスト化。 */
export function CollectSpotImageCell({
  spot,
  busy,
  disabled = false,
  className = "",
  onGenerate,
  onCancelGenerate,
  onUpload,
  onRemove,
}: CollectSpotImageCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const zoneDisabled = disabled || busy !== null;

  const { handleRawFile, openCrop, cropModal } = useSpotImageCropPicker({
    onValidationError: setError,
    onFileReady: (file) => {
      setError(null);
      onUpload(file);
    },
  });
  const src = spot.pendingImage
    ? `data:${spot.pendingImage.mimeType};base64,${spot.pendingImage.data}`
    : null;

  const openFilePicker = () => {
    if (!zoneDisabled) inputRef.current?.click();
  };

  const busyOverlay = busy ? (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-white/90 px-1">
      <Loader2 className="size-4 animate-spin text-[#2563eb]" aria-hidden />
      <span className="text-[10px] font-medium text-[#475569]">
        {busy === "upload" ? "UPLOAD" : "イラスト化"}
      </span>
      {busy === "generate" && onCancelGenerate && (
        <button
          type="button"
          className="relative z-20 mt-0.5 cursor-pointer text-[10px] text-[#64748b] underline transition hover:text-[#0f172a]"
          onClick={(e) => {
            e.stopPropagation();
            onCancelGenerate();
          }}
        >
          キャンセル
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={`flex w-28 flex-col gap-2 ${className}`}>
      {src ? (
        <div className="group relative aspect-16/11 w-full overflow-hidden rounded-lg border border-[#cbd5e1] bg-[#f8fafc] shadow-sm transition">
          {busyOverlay}
          {!busy && (
            <>
              <img
                src={src}
                alt={`${spot.name} の画像`}
                className="absolute inset-0 size-full object-cover"
              />
              <button
                type="button"
                disabled={zoneDisabled}
                onClick={() => {
                  if (!spot.pendingImage) return;
                  setError(null);
                  openCrop(
                    spotImageBase64ToFile(
                      spot.pendingImage.mimeType,
                      spot.pendingImage.data,
                      spot.name,
                    ),
                  );
                }}
                aria-label={`${spot.name} の画像を調整`}
                className="absolute top-1 left-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 enabled:hover:bg-black/70 disabled:cursor-not-allowed"
              >
                <Crop className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                disabled={zoneDisabled}
                onClick={onRemove}
                aria-label={`${spot.name} の画像を削除`}
                className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 enabled:hover:bg-black/70 disabled:cursor-not-allowed"
              >
                <X className="size-3" aria-hidden />
              </button>
            </>
          )}
        </div>
      ) : busy ? (
        <div className="relative aspect-16/11 w-full overflow-hidden rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc]">
          {busyOverlay}
        </div>
      ) : (
        <button
          type="button"
          disabled={zoneDisabled}
          onClick={openFilePicker}
          className={`relative aspect-16/11 w-full overflow-hidden rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] transition ${
            zoneDisabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-[#2563eb] hover:bg-[#eff6ff]"
          }`}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#475569]">
            <Upload className="size-4" aria-hidden />
            <span className="text-[10px] font-medium">UPLOAD</span>
          </div>
        </button>
      )}

      {src && !busy && (
        <button
          type="button"
          disabled={zoneDisabled}
          onClick={onGenerate}
          title="アップロード画像をイラスト化"
          className=" w-full cursor-pointer flex items-center justify-center gap-0.5 rounded-md border border-[#e2e8f0] bg-white px-1 py-1.5 text-[10px] font-medium text-[#475569] transition enabled:hover:border-[#2563eb] enabled:hover:bg-[#eff6ff] enabled:hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="size-3 shrink-0" aria-hidden />
          イラスト化
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={SPOT_IMAGE_ACCEPT}
        className="hidden"
        disabled={zoneDisabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          handleRawFile(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-[10px] leading-tight text-[#dc2626]">{error}</p>}
      {cropModal}
    </div>
  );
}
