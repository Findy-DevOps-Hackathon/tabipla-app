/**
 * 「行った」スポットの訪問履歴をクライアントサイド（localStorage）で管理する。
 *
 * backend-api には訪問履歴 API が存在しないため、ブラウザ完結のデモ実装。
 */

import type { SpotCategory } from "../data/spots.ts";

const VISITED_KEY = "tabipla-user-visited";

/** 訪問履歴 1 件分。「行った」ボタンを押した時点のスポット情報を控える。 */
export type VisitedSpot = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
  /** 行ったと記録した日時（ISO 文字列）。 */
  visitedAt: string;
};

/** localStorage 上の保存形（訪問履歴）。 */
type VisitedStore = VisitedSpot[];

/** 「行った」マークの対象となるスポットの最小情報。 */
export type VisitableSpot = {
  id: string;
  name: string;
  prefecture: string;
  area: string;
  category: SpotCategory;
};

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

function writeStore(items: VisitedStore): void {
  localStorage.setItem(VISITED_KEY, JSON.stringify(items));
}

/** 訪問履歴を新しい順で返す。 */
export function listVisited(): VisitedSpot[] {
  return [...readStore()].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}

/** 指定スポットが「行った」済みかどうか。 */
export function isVisited(spotId: string): boolean {
  return readStore().some((item) => item.id === spotId);
}

/**
 * 「行った」マークを必ず付ける（追加専用）。
 *
 * クーポン利用など「行ったことが確定する操作」で使う。既に記録済みの場合は
 * 何もしない（重複追加や削除はしない）。戻り値は新規に追加したかどうか。
 */
export function markVisited(spot: VisitableSpot): boolean {
  const items = readStore();
  if (items.some((item) => item.id === spot.id)) {
    return false;
  }

  const record: VisitedSpot = {
    id: spot.id,
    name: spot.name,
    prefecture: spot.prefecture,
    area: spot.area,
    category: spot.category,
    visitedAt: new Date().toISOString(),
  };
  writeStore([...items, record]);
  return true;
}

/**
 * 「行った」マークを付け外しする。
 * 未記録なら現在時刻で追加し、記録済みなら削除する。戻り値は操作後の「行った済み」状態。
 */
export function toggleVisited(spot: VisitableSpot): boolean {
  const items = readStore();
  const exists = items.some((item) => item.id === spot.id);

  if (exists) {
    writeStore(items.filter((item) => item.id !== spot.id));
    return false;
  }

  const record: VisitedSpot = {
    id: spot.id,
    name: spot.name,
    prefecture: spot.prefecture,
    area: spot.area,
    category: spot.category,
    visitedAt: new Date().toISOString(),
  };
  writeStore([...items, record]);
  return true;
}
