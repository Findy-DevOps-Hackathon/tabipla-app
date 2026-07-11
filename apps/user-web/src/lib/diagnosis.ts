const KEY = "tabipla-diagnosis-complete";
const DETAILED_KEY = "tabipla-diagnosis-detailed";

/** 好み診断（スワイプ → 目的地 → 分析）を完了済みか。 */
export function isDiagnosisComplete(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** 好み診断完了を記録する。 */
export function markDiagnosisComplete(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // localStorage 不可時はセッション内 state のみに依存する。
  }
}

/** 「好み診断を追加で行う」（深掘り診断）を済ませたか。 */
export function isDetailedDiagnosisComplete(): boolean {
  try {
    return localStorage.getItem(DETAILED_KEY) === "1";
  } catch {
    return false;
  }
}

/** 深掘り診断の完了を記録する。 */
export function markDetailedDiagnosisComplete(): void {
  try {
    localStorage.setItem(DETAILED_KEY, "1");
  } catch {
    // localStorage 不可時はセッション内 state のみに依存する。
  }
}

/** 深掘り診断の完了状態をリセットする（ホームに戻ったときなど）。 */
export function resetDetailedDiagnosisComplete(): void {
  try {
    localStorage.removeItem(DETAILED_KEY);
  } catch {
    // localStorage 不可時はセッション内 state のみに依存する。
  }
}
