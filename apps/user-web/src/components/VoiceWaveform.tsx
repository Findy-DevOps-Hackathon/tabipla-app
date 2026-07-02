type VoiceWaveformProps = {
  levels: number[];
  className?: string;
  /** バーの最大高さ（px）。 */
  maxHeight?: number;
  active?: boolean;
};

/** 固定本数のバー用。並び替えが無いのでスロット ID を key に使う。 */
const WAVE_BAR_KEYS = ["wave-bar-1", "wave-bar-2", "wave-bar-3", "wave-bar-4", "wave-bar-5"] as const;

/** マイク入力の振幅をバーで表示する。 */
export function VoiceWaveform({
  levels,
  className = "",
  maxHeight = 28,
  active = true,
}: VoiceWaveformProps) {
  const minHeight = 4;
  const colorClass = active ? "bg-(--brand)" : "bg-[#cbd5e1]";

  return (
    <div
      className={`flex items-center gap-[3px] ${className}`}
      role="img"
      aria-label={active ? "音声を聞いています" : "音声入力待機中"}
    >
      {WAVE_BAR_KEYS.map((barKey, index) => {
        const level = levels[index] ?? 0;
        const visualLevel = level ** 0.7;
        const height = Math.round(minHeight + visualLevel * (maxHeight - minHeight));
        return (
          <span
            key={barKey}
            className={`w-[3px] rounded-full ${colorClass}`}
            style={{
              height: `${height}px`,
              transition: "height 50ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}
