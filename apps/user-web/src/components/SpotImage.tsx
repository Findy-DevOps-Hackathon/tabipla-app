export type SpotImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** LCP 候補: fetchpriority=high */
  priority?: boolean;
  /** 画面外・一覧下段向け */
  lazy?: boolean;
  draggable?: boolean;
};

/** スポット画像。loading / fetchPriority / decoding を一括指定。 */
export function SpotImage({
  src,
  alt,
  className,
  priority,
  lazy,
  draggable,
}: SpotImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={draggable}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      loading={lazy ? "lazy" : priority ? "eager" : undefined}
    />
  );
}
