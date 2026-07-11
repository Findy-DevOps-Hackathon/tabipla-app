import { useEffect, useRef, useState } from "react";
import { SPOT_IMAGE_PLACEHOLDER } from "../lib/spotMapper.ts";

export type SpotImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** LCP 候補: fetchpriority=high */
  priority?: boolean;
  /** 画面外・一覧下段向け */
  lazy?: boolean;
  draggable?: boolean;
  /** src 切り替え時にじわっとフェードインさせる */
  fadeIn?: boolean;
};

/** スポット画像。loading / fetchPriority / decoding を一括指定。 */
export function SpotImage({
  src,
  alt,
  className,
  priority,
  lazy,
  draggable,
  fadeIn = false,
}: SpotImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src || SPOT_IMAGE_PLACEHOLDER);
  const [visible, setVisible] = useState(!fadeIn);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setResolvedSrc(src || SPOT_IMAGE_PLACEHOLDER);
  }, [src]);

  // src が変わるたびにフェードをリセットする（依存は意図的）
  // biome-ignore lint/correctness/useExhaustiveDependencies: src 変更でフェードをやり直す
  useEffect(() => {
    if (!fadeIn) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setVisible(true);
    }
  }, [fadeIn, src]);

  function reveal() {
    if (!fadeIn) return;
    setVisible(true);
  }

  return (
    <img
      ref={imgRef}
      src={resolvedSrc}
      alt={alt}
      className={`${className ?? ""}${
        fadeIn
          ? ` transition-opacity duration-[1200ms] ease-out ${visible ? "opacity-100" : "opacity-0"}`
          : ""
      }`}
      draggable={draggable}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      loading={lazy ? "lazy" : priority ? "eager" : undefined}
      onLoad={reveal}
      onError={() => {
        if (resolvedSrc !== SPOT_IMAGE_PLACEHOLDER) {
          setResolvedSrc(SPOT_IMAGE_PLACEHOLDER);
        }
        reveal();
      }}
    />
  );
}
