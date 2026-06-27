/**
 * 格子状（グリッド）の装飾背景。
 * 淡いグリッド線にブランドカラーのグロー（ぼかし円）を重ね、中央から外周へフェードさせる。
 * ホームと「あなたへのおすすめスポット」で共通の見た目にするための装飾レイヤー。
 */
export function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-clip">
      {/* グリッド線。中央を濃く、外周へフェードさせるマスクを掛ける */}
      <div
        className="animate-grid-drift absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,23,42,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 28%, #000 55%, transparent 100%)",
          maskImage: "radial-gradient(120% 90% at 50% 28%, #000 55%, transparent 100%)",
        }}
      />
      {/* ブランドカラーのグロー */}
      <div className="absolute -left-20 -top-24 size-64 rounded-full bg-[#23ac73]/20 blur-3xl" />
      <div className="absolute -right-24 top-16 size-56 rounded-full bg-[#0aa19b]/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/2 size-72 -translate-x-1/2 translate-y-1/3 rounded-full bg-[#34d399]/10 blur-3xl" />
    </div>
  );
}
