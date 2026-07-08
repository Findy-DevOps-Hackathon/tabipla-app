import { useState } from "react";
import { SpotImageCropModal } from "../components/SpotImageCropModal.tsx";
import { validateSpotImageFile } from "../lib/spotImageCrop.ts";

type UseSpotImageCropPickerOptions = {
  onFileReady: (file: File) => void;
  onValidationError?: (message: string) => void;
};

/** ファイル選択 → バリデーション → クロップモーダル → 確定後コールバック。 */
export function useSpotImageCropPicker({
  onFileReady,
  onValidationError,
}: UseSpotImageCropPickerOptions) {
  const [cropFile, setCropFile] = useState<File | null>(null);

  function handleRawFile(file: File | null) {
    if (!file) return;
    const validationError = validateSpotImageFile(file);
    if (validationError) {
      onValidationError?.(validationError);
      return;
    }
    setCropFile(file);
  }

  function handleCropConfirm(file: File) {
    setCropFile(null);
    onFileReady(file);
  }

  function handleCropCancel() {
    setCropFile(null);
  }

  const cropModal = (
    <SpotImageCropModal
      open={cropFile !== null}
      file={cropFile}
      onConfirm={handleCropConfirm}
      onCancel={handleCropCancel}
    />
  );

  return { handleRawFile, cropModal };
}
