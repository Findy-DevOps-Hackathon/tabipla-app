import { ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useRef } from "react";
import { SPOT_IMAGE_ACCEPT } from "../api.ts";
import type { CollectedSpotDraft } from "../context/SpotAddDraftContext.tsx";

type CollectSpotImageCellProps = {
  spot: CollectedSpotDraft;
  busy: "generate" | "upload" | null;
  disabled?: boolean;
  className?: string;
  onGenerate: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
};

/** AI 収集プレビュー用: サムネイル + AI 作成 / UPLOAD。 */
export function CollectSpotImageCell({
  spot,
  busy,
  disabled = false,
  className = "",
  onGenerate,
  onUpload,
  onRemove,
}: CollectSpotImageCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneDisabled = disabled || busy !== null;
  const src = spot.pendingImage
    ? `data:${spot.pendingImage.mimeType};base64,${spot.pendingImage.data}`
    : null;

  return (
    <div className={`flex w-[7rem] flex-col gap-2 ${className}`}>
      <div
        className={`group relative aspect-16/11 w-full overflow-hidden rounded-lg border bg-[#f8fafc] transition ${
          src ? "border-[#cbd5e1] shadow-sm" : "border-dashed border-[#cbd5e1]"
        }`}
      >
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/90">
            <Loader2 className="size-4 animate-spin text-[#2563eb]" aria-hidden />
            <span className="text-[10px] font-medium text-[#475569]">
              {busy === "upload" ? "UPLOAD" : "AI"}
            </span>
          </div>
        ) : src ? (
          <>
            <img
              src={src}
              alt={`${spot.name} の画像`}
              className="absolute inset-0 size-full object-cover"
            />
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
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#94a3b8]">
            <ImageIcon className="size-4" aria-hidden />
            <span className="text-[10px]">未設定</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={zoneDisabled}
          onClick={onGenerate}
          title="AI イラストを作成"
          className="inline-flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-[#e2e8f0] bg-white px-1 py-1.5 text-[10px] font-medium text-[#475569] transition enabled:hover:border-[#2563eb] enabled:hover:bg-[#eff6ff] enabled:hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="size-3 shrink-0" aria-hidden />
          {busy === "generate" ? "作成中" : "AI作成"}
        </button>
        <button
          type="button"
          disabled={zoneDisabled}
          onClick={() => inputRef.current?.click()}
          title="画像をアップロード"
          className="inline-flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-[#e2e8f0] bg-white px-1 py-1.5 text-[10px] font-medium text-[#475569] transition enabled:hover:border-[#2563eb] enabled:hover:bg-[#eff6ff] enabled:hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="size-3 shrink-0" aria-hidden />
          {busy === "upload" ? "送信中" : "UPLOAD"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={SPOT_IMAGE_ACCEPT}
          className="hidden"
          disabled={zoneDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
