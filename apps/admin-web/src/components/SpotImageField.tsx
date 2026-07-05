import { Loader2, Upload, X } from "lucide-react";
import { type DragEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { deleteSpotImage, uploadSpotImage } from "../api.ts";
import { resolveSpotImageSrc } from "../lib/spotImage.ts";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;
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
  generateDisabled?: boolean;
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
  generateDisabled = false,
  generateMiss = false,
}: SpotImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(imageUrl ? resolveSpotImageSrc({ id: spotId ?? "preview", imageUrl }) : null);
  }, [pendingFile, imageUrl, spotId]);

  async function handleFileChange(file: File | null) {
    setError(null);
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("JPEG / PNG / WebP のみアップロードできます。");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("画像サイズは 5MB 以下にしてください。");
      return;
    }

    if (spotId) {
      setUploading(true);
      try {
        const spot = await uploadSpotImage(spotId, file);
        onImageUrlChange(spot.imageUrl);
        onPendingFileChange(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "画像のアップロードに失敗しました");
      } finally {
        setUploading(false);
      }
      return;
    }

    onPendingFileChange(file);
  }

  async function handleRemove(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    onPendingFileChange(null);
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

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (disabled || uploading || deleting) return;
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading || deleting) return;
    const file = e.dataTransfer.files?.[0] ?? null;
    void handleFileChange(file);
  }

  const hasImage = Boolean(previewUrl);
  const zoneDisabled = disabled || uploading || deleting || generating;

  return (
    <div className="flex flex-col gap-3 lg:col-span-2">
      <div className="flex flex-wrap items-end gap-4">
        <p className="text-sm font-medium text-[#0f172a]">画像</p>
        {onGenerate && (
          <>
            <button
              type="button"
              className="cursor-pointer rounded-full text-xs text-[#2563eb] underline transition enabled:hover:bg-[#e2e8f0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={generating || generateDisabled || zoneDisabled}
              onClick={onGenerate}
            >
              {generating ? "生成中…" : "参考イラストを生成"}
            </button>
            {generateMiss && (
              <p className="text-xs text-[#64748b]">
                参考イラストを生成できませんでした。紹介文を入力するか、実際の写真をアップロードしてください。
              </p>
            )}
          </>
        )}
      </div>

      <label
        className={`group relative flex w-full max-w-[500px] ${SPOT_IMAGE_ASPECT} cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
          zoneDisabled ? "cursor-not-allowed opacity-60" : "hover:border-[#2563eb]"
        } ${
          dragging
            ? "border-[#2563eb] bg-[#eff6ff]"
            : hasImage
              ? "border-[#e2e8f0] bg-[#f8fafc]"
              : "border-[#cbd5e1] bg-white/20"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={zoneDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void handleFileChange(file);
          }}
        />

        {uploading ? (
          <>
            <Loader2 className="size-10 animate-spin text-[#2563eb]" aria-hidden />
            <p className="mt-4 font-medium text-[#0f172a]">アップロード中…</p>
          </>
        ) : generating ? (
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
            <p className="relative z-10 mt-4 font-medium text-[#0f172a]">参考イラストを生成中…</p>
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
              正確な表示のため、可能な限り実際の写真をアップロードしてください
            </p>
          </div>
        )}
      </label>

      {!spotId && pendingFile && (
        <p className="text-xs text-[#64748b]">保存時に画像をアップロードします。</p>
      )}

      {error && <p className="text-xs text-[#dc2626]">{error}</p>}
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
