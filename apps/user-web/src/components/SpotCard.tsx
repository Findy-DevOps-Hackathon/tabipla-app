import type { SearchResult } from "../types.ts";

type SpotCardProps = {
  result: SearchResult;
};

/** カテゴリごとの色分け（該当なしは既定色）。 */
const CATEGORY_COLORS: Record<string, string> = {
  観光: "bg-rose-100 text-rose-700",
  グルメ: "bg-amber-100 text-amber-700",
  宿泊: "bg-violet-100 text-violet-700",
  自然: "bg-emerald-100 text-emerald-700",
};

export function SpotCard({ result }: SpotCardProps) {
  const { document: spot, score } = result;
  const categoryColor =
    (spot.category && CATEGORY_COLORS[spot.category]) ??
    "bg-slate-100 text-slate-600";

  const place = [spot.prefecture, spot.area].filter(Boolean).join(" / ");

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="mb-2 flex items-center gap-2">
        {spot.category && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryColor}`}
          >
            {spot.category}
          </span>
        )}
        {place && <span className="text-xs text-slate-500">{place}</span>}
      </div>

      <h3 className="text-lg font-bold text-slate-900">{spot.name}</h3>

      <p className="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600">
        {spot.description}
      </p>

      {spot.tags && spot.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {spot.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-200"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}

      {score !== null && (
        <div className="mt-3 text-right text-[11px] tabular-nums text-slate-400">
          score {score.toFixed(2)}
        </div>
      )}
    </article>
  );
}
