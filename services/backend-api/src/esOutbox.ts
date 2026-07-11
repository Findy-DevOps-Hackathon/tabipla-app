import {
  type Database,
  type EsSyncOperation,
  type EsSyncOutboxPayload,
  type EsSyncOutboxRow,
  enqueueEsSync,
  getSpotById,
  listPendingEsSync,
  markEsSyncCompleted,
  markEsSyncFailed,
} from "@tabipla/db";
import {
  deleteSpot as deleteSpotInElasticsearch,
  type ElasticsearchClient,
  type SpotDocument,
} from "@tabipla/search-core";
import type { FastifyBaseLogger } from "fastify";
import { patchSpotInElasticsearch, upsertSpotInElasticsearch } from "./esSync.js";
import { toSpotDocument } from "./mapper.js";

export type EsSyncResult = {
  synced: boolean;
  error?: string;
};

type SyncSpotParams = {
  client: ElasticsearchClient;
  db: Database;
  spotId: string;
  operation: EsSyncOperation;
  payload?: EsSyncOutboxPayload | null;
  refresh?: boolean;
};

function parseOutboxPayload(row: EsSyncOutboxRow): EsSyncOutboxPayload | null {
  if (!row.payload || typeof row.payload !== "object") return null;
  const raw = row.payload as Record<string, unknown>;
  if (!Array.isArray(raw.embedding)) return null;
  return { embedding: raw.embedding as number[] };
}

function formatSyncError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function executeEsSync({
  client,
  db,
  spotId,
  operation,
  payload,
  refresh = false,
}: SyncSpotParams): Promise<void> {
  if (operation === "delete") {
    await deleteSpotInElasticsearch(client, spotId, { refresh });
    return;
  }

  const row = await getSpotById(db, spotId);
  if (!row) {
    if (operation === "upsert" || operation === "patch") {
      return;
    }
    throw new Error(`[esOutbox] スポット ${spotId} が DB に見つかりません。`);
  }

  const document = toSpotDocument(row);
  if (operation === "upsert") {
    const embedding = payload?.embedding;
    if (!embedding) {
      throw new Error(`[esOutbox] スポット ${spotId} の upsert には embedding が必要です。`);
    }
    await upsertSpotInElasticsearch(client, { ...document, embedding }, { refresh });
    return;
  }

  const { id, ...partial } = document;
  await patchSpotInElasticsearch(client, id, partial, { refresh });
}

/** outbox の1件を処理する。 */
export async function processEsSyncOutboxEntry(
  client: ElasticsearchClient,
  db: Database,
  entry: EsSyncOutboxRow,
  options: { refresh?: boolean } = {},
): Promise<EsSyncResult> {
  try {
    await executeEsSync({
      client,
      db,
      spotId: entry.spotId,
      operation: entry.operation as EsSyncOperation,
      payload: parseOutboxPayload(entry),
      refresh: options.refresh,
    });
    await markEsSyncCompleted(db, entry.id);
    return { synced: true };
  } catch (error) {
    const message = formatSyncError(error);
    await markEsSyncFailed(db, entry.id, message, entry.attempts + 1);
    return { synced: false, error: message };
  }
}

/** pending の outbox をバッチ処理する。 */
export async function processEsSyncOutboxBatch(
  client: ElasticsearchClient,
  db: Database,
  batchSize: number,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const entries = await listPendingEsSync(db, batchSize);
  let succeeded = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await processEsSyncOutboxEntry(client, db, entry);
    if (result.synced) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return { processed: entries.length, succeeded, failed };
}

type WriteThroughParams = SyncSpotParams & {
  log: FastifyBaseLogger;
};

/**
 * DB 書き込み後の ES write-through。
 * 失敗時は outbox に積み、バックグラウンド再試行で追いつかせる。
 */
export async function writeThroughSpotToElasticsearch({
  client,
  db,
  log,
  spotId,
  operation,
  payload = null,
  refresh = false,
}: WriteThroughParams): Promise<EsSyncResult> {
  const entry = await enqueueEsSync(db, spotId, operation, payload);

  try {
    await executeEsSync({ client, db, spotId, operation, payload, refresh });
    await markEsSyncCompleted(db, entry.id);
    return { synced: true };
  } catch (error) {
    const message = formatSyncError(error);
    log.warn({ err: error, spotId, operation }, "ES write-through に失敗。outbox で再試行します。");
    await markEsSyncFailed(db, entry.id, message, entry.attempts + 1);
    return { synced: false, error: message };
  }
}

export type EsSyncWorkerOptions = {
  client: ElasticsearchClient;
  db: Database;
  log: FastifyBaseLogger;
  intervalMs?: number;
  batchSize?: number;
};

function resolveIntervalMs(): number {
  const raw = process.env.ES_SYNC_RETRY_INTERVAL_MS;
  if (!raw) return 30_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

function resolveBatchSize(): number {
  const raw = process.env.ES_SYNC_BATCH_SIZE;
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function isWorkerEnabled(): boolean {
  const raw = process.env.ES_SYNC_WORKER_ENABLED;
  if (raw === undefined) return true;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** バックグラウンドで outbox の再試行を行う。stop() で停止できる。 */
export function startEsSyncWorker(options: EsSyncWorkerOptions): { stop: () => void } {
  if (!isWorkerEnabled()) {
    options.log.info("ES sync worker は無効です (ES_SYNC_WORKER_ENABLED=false)");
    return { stop: () => {} };
  }

  const intervalMs = options.intervalMs ?? resolveIntervalMs();
  const batchSize = options.batchSize ?? resolveBatchSize();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processEsSyncOutboxBatch(options.client, options.db, batchSize);
      if (result.processed > 0) {
        options.log.info(
          { ...result },
          `ES sync worker: ${result.succeeded} 件成功 / ${result.failed} 件失敗`,
        );
      }
    } catch (error) {
      options.log.error({ err: error }, "ES sync worker の実行に失敗");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  void tick();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}

/** CLI 用: pending outbox を処理して終了する。 */
export async function runEsSyncOutboxOnce(
  client: ElasticsearchClient,
  db: Database,
  batchSize = resolveBatchSize(),
): Promise<void> {
  let totalProcessed = 0;
  while (true) {
    const result = await processEsSyncOutboxBatch(client, db, batchSize);
    totalProcessed += result.processed;
    if (result.processed === 0) break;
    console.log(
      `[sync-es-outbox] バッチ完了: ${result.succeeded} 件成功 / ${result.failed} 件失敗`,
    );
  }
  console.log(`[sync-es-outbox] 完了: 合計 ${totalProcessed} 件を処理しました。`);
}

export type SpotWriteResponse<T> = T & { esSyncPending?: boolean };

export function withEsSyncStatus<T extends SpotDocument>(
  document: T,
  syncResult: EsSyncResult,
): SpotWriteResponse<T> {
  if (syncResult.synced) return document;
  return { ...document, esSyncPending: true };
}
