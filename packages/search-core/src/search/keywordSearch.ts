import type { estypes } from "@elastic/elasticsearch";
import type { ElasticsearchClient } from "../client/elasticsearch.client.js";
import { DEFAULT_INDEX_NAME } from "../mappings/spot.mapping.js";
import type { SearchResult, SpotDocument } from "../types/spot.js";

/**
 * キーワード検索のデフォルト対象フィールド。
 * name を強めに重み付けし、説明・エリア・タグも対象にする。
 */
export const DEFAULT_SEARCH_FIELDS = ["name^3", "description", "area", "tags"] as const;

/** 1ページあたりのデフォルト取得件数。 */
export const DEFAULT_SIZE = 10;

export type KeywordSearchParams = {
  /** 検索キーワード。空文字の場合は全件（match_all）扱い。 */
  query: string;
  /**
   * filter 条件。`{ フィールド名: 値 }` を term filter として AND 結合する。
   * 値が配列の場合は terms filter（いずれかに一致）として扱う。
   */
  filters?: Record<string, unknown>;
  /** 取得件数（size）。省略時は DEFAULT_SIZE。 */
  size?: number;
  /** 取得開始位置（from）。省略時は 0。 */
  from?: number;
  /** 検索対象 index 名。省略時は DEFAULT_INDEX_NAME。 */
  index?: string;
  /** 検索対象フィールド。省略時は DEFAULT_SEARCH_FIELDS。 */
  fields?: readonly string[];
};

/**
 * filters オブジェクトを Elasticsearch の filter 句配列に変換する。
 */
export function buildFilters(filters?: Record<string, unknown>): estypes.QueryDslQueryContainer[] {
  if (!filters) return [];
  return Object.entries(filters).map(([field, value]) => {
    if (Array.isArray(value)) {
      return { terms: { [field]: value } };
    }
    return { term: { [field]: value as string | number | boolean } };
  });
}

/**
 * 検索ヒットを SearchResult 型へ変換する共通ヘルパー。
 */
export function toSearchResult<T extends SpotDocument>(hit: estypes.SearchHit<T>): SearchResult<T> {
  return {
    id: hit._id ?? (hit._source?.id as string),
    score: hit._score ?? null,
    document: hit._source as T,
  };
}

/**
 * キーワード検索（全文検索）を実行する。
 *
 * - query が空文字の場合は match_all（フィルタのみ適用）として扱う。
 * - filters は term/terms フィルタとして AND 結合する。
 * - size / from でページングを制御する。
 *
 * @param client Elasticsearch クライアント
 * @param params 検索パラメータ
 * @returns 検索結果配列
 */
export async function keywordSearch<T extends SpotDocument = SpotDocument>(
  client: ElasticsearchClient,
  params: KeywordSearchParams,
): Promise<SearchResult<T>[]> {
  const index = params.index ?? DEFAULT_INDEX_NAME;
  const size = params.size ?? DEFAULT_SIZE;
  const from = params.from ?? 0;
  const fields = (params.fields ?? DEFAULT_SEARCH_FIELDS) as string[];
  const filter = buildFilters(params.filters);

  const trimmed = params.query?.trim() ?? "";
  const mustQuery: estypes.QueryDslQueryContainer = trimmed
    ? { multi_match: { query: trimmed, fields } }
    : { match_all: {} };

  const response = await client.search<T>({
    index,
    from,
    size,
    query: {
      bool: {
        must: [mustQuery],
        filter,
      },
    },
  });

  return response.hits.hits.map((hit) => toSearchResult<T>(hit));
}
