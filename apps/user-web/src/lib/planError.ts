export type PlanErrorPresentation = {
  title: string;
  message: string;
  hint?: string;
};

/** API/通信エラーをユーザー向け文言に変換する（技術用語・「AI」表記は出さない）。 */
export function presentPlanError(raw: string): PlanErrorPresentation {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (
    text.includes("接続できません") ||
    text.includes("8080") ||
    text.includes("503") ||
    lower.includes("econnrefused") ||
    text.includes("サービス")
  ) {
    return {
      title: "おすすめを作成できませんでした",
      message: "おすすめ作成サービスに接続できませんでした。",
      hint: "しばらく待ってから「もう一度試す」を押してください。",
    };
  }

  if (text.includes("Failed query") || text.includes("database") || lower.includes("postgres")) {
    return {
      title: "おすすめを作成できませんでした",
      message: "スポット情報の取得に失敗しました。",
      hint: "時間をおいてから再度お試しください。",
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    text.includes("ネットワーク") ||
    text.includes("通信")
  ) {
    return {
      title: "おすすめを作成できませんでした",
      message: "通信エラーが発生しました。",
      hint: "通信環境を確認してから再度お試しください。",
    };
  }

  if (text.includes("見つかりませんでした") || text.includes("登録されていません")) {
    return {
      title: "おすすめが見つかりませんでした",
      message: text,
      hint: "目的地や好みの設定を変えて、もう一度お試しください。",
    };
  }

  // バックエンドが返した日本語メッセージのうち、技術情報っぽくないものはそのまま表示
  if (text.length > 0 && !text.includes("services/") && !lower.includes("error:")) {
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
