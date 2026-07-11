/**
 * 「行った」スポットの訪問履歴をクライアントサイド（localStorage）で管理する。
 *
 * backend-api には訪問履歴 API が存在しないため、ブラウザ完結のデモ実装。
 */

const VISITED_KEY = "tabipla-user-visited";

type VisitedSpot = {
  id: string;
  visitedAt: string;
};

type VisitedStore = VisitedSpot[];

function readStore(): VisitedStore {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as VisitedStore;
    }
    // 旧形式（ユーザー ID 別オブジェクト）からの移行
    if (parsed && typeof parsed === "object") {
      const legacy = parsed as Record<string, VisitedSpot[]>;
      return legacy.guest ?? legacy.local ?? Object.values(legacy).flat();
    }
    return [];
  } catch {
    return [];
  }
}

/** 指定スポットが「行った」済みかどうか。 */
export function isVisited(spotId: string): boolean {
  return readStore().some((item) => item.id === spotId);
}
