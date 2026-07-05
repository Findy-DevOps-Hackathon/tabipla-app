const AI_GUIDE_AVATAR_SRC = "/ai-guide-avatar.png";
/** 元画像 520×646 の縦横比 */
const AI_GUIDE_AVATAR_ASPECT = 646 / 520;

type AiGuideAvatarProps = {
  /** 回答生成中など、話している演出を付ける */
  speaking?: boolean;
  size?: number;
  className?: string;
};

/** AIガイド用アバター（スポット横断で同一キャラ） */
export function AiGuideAvatar({ speaking = false, size = 40, className = "" }: AiGuideAvatarProps) {
  const height = Math.round(size * AI_GUIDE_AVATAR_ASPECT);

  return (
    <div
      className={`relative shrink-0 ${speaking ? "animate-ai-guide-speak" : ""} ${className}`}
      aria-hidden
    >
      {/* 左配置のチャット UI では右（会話側）を向くよう反転 */}
      <div className="-scale-x-100">
        <img
          src={AI_GUIDE_AVATAR_SRC}
          alt=""
          width={size}
          height={height}
          className="block object-contain"
          draggable={false}
        />
      </div>
      {speaking && (
        <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-(--brand) ring-2 ring-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
        </span>
      )}
    </div>
  );
}
