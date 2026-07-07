import { AsyncLocalStorage } from "node:async_hooks";

export interface ToolCallContext {
  count: number;
  lastCall?: { name: string; argsJson: string };
}

export const toolCallStorage = new AsyncLocalStorage<ToolCallContext>();

/**
 * ツール実行前にループ検知および実行回数制限チェックを行う。
 * ループや制限超過を検知した場合はエラー情報を返し、LLMへ対話を切り上げるよう指示する。
 */
export function checkToolLoop(
  toolName: string,
  args: unknown,
): { status: "error"; error: string; message: string } | null {
  const store = toolCallStorage.getStore();
  if (!store) {
    return null;
  }

  // 1. 呼び出し回数しきい値チェック（最大5回）
  store.count++;
  if (store.count > 5) {
    return {
      status: "error",
      error: "Tool call limit exceeded",
      message:
        "警告: ツール呼び出し回数の上限（5回）に達しました。安全のためこれ以上の探索や呼び出しは行わず、現在得られている情報だけを整理して、簡潔にユーザーへ回答（または合意）し、速やかに処理を完了させてください。",
    };
  }

  // 2. 同一パラメータによる連続ループチェック
  const argsJson = JSON.stringify(args);
  if (store.lastCall && store.lastCall.name === toolName && store.lastCall.argsJson === argsJson) {
    return {
      status: "error",
      error: "Loop detected",
      message:
        "警告: 同じツールが同一パラメータで連続して呼び出されました（ループの恐れ）。追加の呼び出しは抑止されました。これ以上の探索は行わず、手元にある情報のみで回答を簡潔にまとめて完了させてください。",
    };
  }

  // 直近の呼び出し情報を更新
  store.lastCall = { name: toolName, argsJson };
  return null;
}
