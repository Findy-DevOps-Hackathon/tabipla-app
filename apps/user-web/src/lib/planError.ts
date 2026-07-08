export type PlanErrorPresentation = {
  title: string;
  message: string;
  hint?: string;
};

const SYSTEM_ERROR_PATTERN =
  /429|quota|rate|gemini|vertex|レート制限|リクエスト上限|services\/|8080|error:|failed query|postgres|database|econnrefused|fetch failed|\[agent|\[backend-api|aiエージェント/i;

function isBusyError(text: string): boolean {
  return /429|quota|rate|レート制限|リクエスト上限|混み合/i.test(text);
}

/** 技術・システム向けのエラー文言かどうか。 */
export function isSystemFacingError(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  return text.startsWith("⚠️") || SYSTEM_ERROR_PATTERN.test(text);
}

/** API/通信エラーをユーザー向けの短い文言に変換する。 */
export function sanitizeUserFacingError(raw: string, context: "plan" | "chat" = "plan"): string {
  const text = raw.trim();
  if (!text || !isSystemFacingError(text)) {
    return text.replace(/AIエージェント/g, "おすすめ作成サービス");
  }

  if (isBusyError(text)) {
    return context === "chat"
      ? "ただいま混み合っています。1分ほど待ってから、もう一度お試しください。"
      : "ただいま混み合っています。";
  }

  if (
    text.includes("接続できません") ||
    text.includes("8080") ||
    text.includes("503") ||
    text.toLowerCase().includes("econnrefused") ||
    text.includes("サービス")
  ) {
    return context === "chat"
      ? "ガイドに接続できませんでした。しばらく待ってから、もう一度お試しください。"
      : "おすすめ作成サービスに接続できませんでした。";
  }

  if (
    text.toLowerCase().includes("fetch failed") ||
    text.toLowerCase().includes("network") ||
    text.includes("ネットワーク") ||
    text.includes("通信")
  ) {
    return context === "chat"
      ? "通信エラーが発生しました。通信環境を確認してから、もう一度お試しください。"
      : "通信エラーが発生しました。";
  }

  return context === "chat"
    ? "回答を取得できませんでした。しばらく待ってから、もう一度お試しください。"
    : "おすすめの作成に失敗しました。";
}

/** API/通信エラーをユーザー向け文言に変換する（技術用語・「AI」表記は出さない）。 */
export function presentPlanError(raw: string): PlanErrorPresentation {
  const text = raw.trim();

  if (text.includes("見つかりませんでした") || text.includes("登録されていません")) {
    return {
      title: "おすすめが見つかりませんでした",
      message: text,
      hint: "目的地や好みの設定を変えて、もう一度お試しください。",
    };
  }

  if (isSystemFacingError(text)) {
    const message = sanitizeUserFacingError(text, "plan");
    if (isBusyError(text)) {
      return {
        title: "おすすめを作成できませんでした",
        message,
        hint: "1分ほど待ってから再度お試しください。",
      };
    }
    if (message.includes("接続")) {
      return {
        title: "おすすめを作成できませんでした",
        message,
        hint: "しばらく待ってから「もう一度試す」を押してください。",
      };
    }
    if (message.includes("通信")) {
      return {
        title: "おすすめを作成できませんでした",
        message,
        hint: "通信環境を確認してから再度お試しください。",
      };
    }
    return {
      title: "おすすめを作成できませんでした",
      message,
      hint: "もう一度試すか、入力内容を見直してください。",
    };
  }

  if (text.length > 0) {
    return {
      title: "おすすめを作成できませんでした",
      message: text.replace(/AIエージェント/g, "おすすめ作成サービス"),
    };
  }

  return {
    title: "おすすめを作成できませんでした",
    message: "おすすめの作成に失敗しました。",
    hint: "もう一度試すか、入力内容を見直してください。",
  };
}
