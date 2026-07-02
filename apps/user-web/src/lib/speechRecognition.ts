/** Web Speech API（SpeechRecognition）の薄いラッパー。 */

export type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** マイク入力（getUserMedia）が HTTPS 等の安全なコンテキストで使えるか。 */
export function isMediaDevicesSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

/**
 * マイクボタンを表示してよいか。
 * SP では Chrome 等で SpeechRecognition が無くても getUserMedia は使えるため、
 * 音声認識 API 単体の判定だけだとボタンが消える。
 */
export function isVoiceInputSupported(): boolean {
  return isSpeechRecognitionSupported() || isMediaDevicesSupported();
}

/** 音声認識エラーを UI 向けメッセージへ変換する。 */
export function speechRecognitionErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの利用が許可されていません。\nブラウザの設定でこのサイトのマイクを「許可」にしてください。";
    case "no-speech":
      return "音声が聞き取れませんでした。もう一度お試しください。";
    case "network":
      return "音声認識にネットワーク接続が必要です。";
    case "aborted":
      return "";
    default:
      return "音声入力に失敗しました。もう一度お試しください。";
  }
}
