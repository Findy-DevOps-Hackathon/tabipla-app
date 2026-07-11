import { Loader2, Upload, X } from "lucide-react";
import { type DragEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import {
  deleteSpotImage,
  fetchSpotImageAsFile,
  SPOT_IMAGE_ACCEPT,
  uploadSpotImage,
} from "../api.ts";
import { useSpotImageCropPicker } from "../hooks/useSpotImageCropPicker.tsx";
import { resolveSpotImageSrc } from "../lib/spotImage.ts";

const SPOT_IMAGE_FILE_INPUT_ID = "spot-image-file-input";

/** user-web SpotDetailModal のヒーロー画像と同じ比率。 */
const SPOT_IMAGE_ASPECT = "aspect-16/11";

type SpotImageFieldProps = {
  spotId?: string;
  imageUrl?: string;
  pendingFile: File | null;
  onImageUrlChange: (imageUrl: string | undefined) => void;
  onPendingFileChange: (file: File | null) => void;
  disabled?: boolean;
  generating?: boolean;
  onGenerate?: () => void;
  onCancelGenerate?: () => void;
  generateMiss?: boolean;
};

/** 観光地フォーム用の画像アップロード UI。 */
export function SpotImageField({
  spotId,
  imageUrl,
  pendingFile,
  onImageUrlChange,
  onPendingFileChange,
  disabled = false,
  generating = false,
  onGenerate,
  onCancelGenerate,
  generateMiss = false,
}: SpotImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preparingCrop, setPreparingCrop] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { handleRawFile, openCrop, cropModal } = useSpotImageCropPicker({
    onValidationError: setError,
    onFileReady: (file) => applyFile(file),
  });

  useEffect(() => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(imageUrl ? resolveSpotImageSrc({ id: spotId ?? "preview", imageUrl }) : null);
  }, [pendingFile, imageUrl, spotId]);

  function handleFileChange(file: File | null) {
    setError(null);
    handleRawFile(file);
  }

  function applyFile(file: File) {
    onPendingFileChange(file);
  }

  async function handleRecrop() {
    setError(null);
    setPreparingCrop(true);
    try {
      const file = await fetchSpotImageAsFile({
        pendingFile,
        imageUrl,
        spotId,
        fileName: spotId ?? "spot",
      });
      if (!file) return;
      openCrop(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の読み込みに失敗しました");
    } finally {
      setPreparingCrop(false);
    }
  }

  async function handleRemove(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    // 未保存の選択画像だけ破棄し、サーバー上の既存画像は残す
    if (pendingFile) {
      onPendingFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (inputRef.current) inputRef.current.value = "";

    if (spotId && imageUrl) {
      setDeleting(true);
      try {
        await deleteSpotImage(spotId);
        onImageUrlChange(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : "画像の削除に失敗しました");
      } finally {
        setDeleting(false);
      }
      return;
    }

    onImageUrlChange(undefined);
  }

  function handleDragOver(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    if (disabled || deleting) return;
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled || deleting) return;
    const file = e.dataTransfer.files?.[0] ?? null;
    void handleFileChange(file);
  }

  const hasImage = Boolean(previewUrl);
  const zoneDisabled = disabled || deleting || generating || preparingCrop;
  const isFilePickerZone = !generating && !deleting;

  const zoneClassName = `group relative flex w-full max-w-[500px] ${SPOT_IMAGE_ASPECT} flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
    generating
      ? "cursor-default"
      : zoneDisabled
        ? "cursor-not-allowed opacity-60"
        : "cursor-pointer hover:border-[#2563eb]"
  } ${
    dragging
      ? "border-[#2563eb] bg-[#eff6ff]"
      : hasImage
        ? "border-[#e2e8f0] bg-[#f8fafc]"
        : "border-[#cbd5e1] bg-white/20"
  }`;

  const zoneContent = (
    <>
      {isFilePickerZone && (
        <input
          id={SPOT_IMAGE_FILE_INPUT_ID}
          ref={inputRef}
          type="file"
          accept={SPOT_IMAGE_ACCEPT}
          className="hidden"
          disabled={zoneDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void handleFileChange(file);
          }}
        />
      )}

      {generating ? (
        <>
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-40"
              decoding="async"
            />
          )}
          <Loader2 className="relative z-10 size-10 animate-spin text-[#2563eb]" aria-hidden />
          <p className="relative z-10 mt-4 font-medium text-[#0f172a]">
            アップロード画像をイラスト化中…
          </p>
          {onCancelGenerate && (
            <button
              type="button"
              className="relative z-20 mt-3 cursor-pointer rounded-full border border-[#e2e8f0] bg-white px-4 py-1.5 text-sm font-medium text-[#475569] shadow-sm transition hover:border-[#cbd5e1] hover:text-[#0f172a]"
              onClick={onCancelGenerate}
            >
              キャンセル
            </button>
          )}
        </>
      ) : deleting ? (
        <>
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-40"
              decoding="async"
            />
          )}
          <Loader2 className="relative z-10 size-10 animate-spin text-[#2563eb]" aria-hidden />
          <p className="relative z-10 mt-4 font-medium text-[#0f172a]">削除中…</p>
        </>
      ) : hasImage && previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt="スポット画像プレビュー"
            className="absolute inset-0 size-full object-cover"
            decoding="async"
            fetchPriority="high"
          />
          <div
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center transition ${
              dragging
                ? "bg-[#eff6ff]/90 opacity-100"
                : "bg-black/40 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Upload className="mb-2 size-8 text-white" />
            <p className="text-sm font-medium text-white">クリックまたはドラッグで変更</p>
          </div>
          <button
            type="button"
            aria-label="画像を削除"
            disabled={zoneDisabled}
            onClick={(e) => void handleRemove(e)}
            className="absolute top-3 right-3 z-20 flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-[#64748b] shadow transition hover:bg-white hover:text-[#dc2626] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center px-6 text-center">
          <Upload className="mb-4 size-10 text-[#94a3b8]" />
          <p className="font-medium text-[#0f172a]">
            ファイルをドラッグ＆ドロップ、またはクリックして選択
          </p>
          <p className="mt-2 text-sm text-[#64748b]">JPEG / PNG / WebP・最大 5MB</p>
          <p className="mt-2 text-xs text-[#94a3b8]">
            アップロード後も「位置を調整」でトリミングできます（16:11）。写真をアップロードすると「イラスト化」も使えます
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 lg:col-span-2">
      <div className="flex flex-wrap items-end gap-4">
        <p className="text-sm font-medium text-[#0f172a]">画像</p>
        {hasImage && (
          <button
            type="button"
            className="cursor-pointer rounded-full text-xs text-[#2563eb] underline transition enabled:hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={zoneDisabled}
            onClick={() => void handleRecrop()}
          >
            {preparingCrop ? "読み込み中…" : "位置を調整"}
          </button>
        )}
        {onGenerate && (
          <>
            <button
              type="button"
              className="cursor-pointer rounded-full text-xs text-[#2563eb] underline transition enabled:hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasImage || generating || zoneDisabled}
              onClick={onGenerate}
            >
              {generating ? "生成中…" : "アップロード画像をイラスト化"}
            </button>
            {generating && onCancelGenerate && (
              <button
                type="button"
                className="cursor-pointer rounded-full text-xs text-[#64748b] underline transition hover:bg-[#e2e8f0] hover:text-[#0f172a]"
                onClick={onCancelGenerate}
              >
                キャンセル
              </button>
            )}
            {!hasImage && (
              <p className="text-xs text-[#64748b]">先に写真をアップロードしてください</p>
            )}
            {generateMiss && hasImage && (
              <p className="text-xs text-[#64748b]">
                イラスト化に失敗しました。別の写真をアップロードするか、もう一度お試しください。
              </p>
            )}
          </>
        )}
      </div>

      {isFilePickerZone ? (
        <label
          htmlFor={SPOT_IMAGE_FILE_INPUT_ID}
          className={zoneClassName}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {zoneContent}
        </label>
      ) : (
        <div className={zoneClassName}>{zoneContent}</div>
      )}

      {error && <p className="text-xs text-[#dc2626]">{error}</p>}
      {cropModal}
    </div>
  );
}

/** 新規登録保存後に保留中ファイルをアップロードする。 */
export async function uploadPendingSpotImage(
  spotId: string,
  file: File,
): Promise<string | undefined> {
  const spot = await uploadSpotImage(spotId, file);
  return spot.imageUrl;
}
