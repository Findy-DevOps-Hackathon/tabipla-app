import Cropper, { type Area } from "react-easy-crop";
import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "./ui/Button.tsx";
import { cropSpotImageFile, SPOT_IMAGE_ASPECT } from "../lib/spotImageCrop.ts";

type SpotImageCropModalProps = {
  open: boolean;
  file: File | null;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

/** スポット画像のズーム・トリミング用モーダル（16:11 固定）。 */
export function SpotImageCropModal({
  open,
  file,
  onConfirm,
  onCancel,
}: SpotImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!file || !imageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    setError(null);
    try {
      const cropped = await cropSpotImageFile(
        imageSrc,
        croppedAreaPixels,
        file.type,
        file.name,
      );
      onConfirm(cropped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像の加工に失敗しました");
    } finally {
      setProcessing(false);
    }
  }

  if (!open || !file || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-image-crop-title"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] px-6 py-4">
          <div className="min-w-0">
            <h2 id="spot-image-crop-title" className="text-lg font-bold text-[#0f172a]">
              画像の位置とサイズを調整
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              ドラッグで位置、スライダーでズームを調整してください（16:11）
            </p>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            disabled={processing}
            onClick={onCancel}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="relative h-80 bg-[#0f172a]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={SPOT_IMAGE_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="flex flex-col gap-2 px-6 py-4">
          <label htmlFor="spot-image-zoom" className="text-sm font-medium text-[#0f172a]">
            ズーム
          </label>
          <input
            id="spot-image-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[#2563eb]"
          />
        </div>

        {error && <p className="px-6 pb-2 text-sm text-[#dc2626]">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-[#e2e8f0] px-6 py-4">
          <Button variant="secondary" disabled={processing} onClick={onCancel}>
            キャンセル
          </Button>
          <Button disabled={processing || !croppedAreaPixels} onClick={() => void handleConfirm()}>
            {processing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                加工中…
              </>
            ) : (
              "確定"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
