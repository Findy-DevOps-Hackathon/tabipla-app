import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_LEVEL_BAR_COUNT, AudioLevelMonitor, emptyAudioLevels } from "./audioLevel.ts";
import { isIOS, isIOSSafari, isMobileDevice } from "./platform.ts";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  isVoiceInputSupported,
  type SpeechRecognitionInstance,
  speechRecognitionErrorMessage,
} from "./speechRecognition.ts";

type UseSpeechRecognitionOptions = {
  lang?: string;
  /** 音声入力開始時点の入力欄テキスト（リアルタイム追記の基点）。 */
  getBaseText?: () => string;
  /** 基点 + 今回のセッション分を含む、入力欄に表示する全文。 */
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
};

/** event.results から確定・途中結果をすべて連結する。 */
function resultsToTranscript(results: SpeechRecognitionEvent["results"]): string {
  let transcript = "";
  for (let i = 0; i < results.length; i++) {
    const alt = results[i]?.[0];
    if (alt) transcript += alt.transcript;
  }
  return transcript;
}

function voiceInputUnavailableMessage(): string {
  if (isIOS() && !isIOSSafari()) {
    return "このブラウザでは音声入力に対応していません。\nSafariで開いてください。";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "音声入力には HTTPS でのアクセスが必要です。";
  }
  return "このブラウザでは音声入力に対応していません。";
}

/**
 * ブラウザの SpeechRecognition で音声→テキスト変換する。
 * interimResults により話している最中も入力欄を逐次更新する。
 * 文字起こしのラグ中は audioLevels で振幅波形を表示できる。
 */
export function useSpeechRecognition({
  lang = "ja-JP",
  getBaseText,
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions) {
  const [supported, setSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return isVoiceInputSupported() || isMobileDevice();
  });
  const [listening, setListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(() => emptyAudioLevels());
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const monitorRef = useRef<AudioLevelMonitor | null>(null);
  const shouldContinueRef = useRef(false);
  const baseTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const getBaseTextRef = useRef(getBaseText);

  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  getBaseTextRef.current = getBaseText;

  useEffect(() => {
    setSupported(isVoiceInputSupported() || isMobileDevice());
  }, []);

  const stopMonitor = useCallback(() => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    setAudioLevels(emptyAudioLevels());
  }, []);

  const startMonitor = useCallback(
    async (deferMs = 0) => {
      stopMonitor();
      if (deferMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, deferMs));
        if (!shouldContinueRef.current) return;
      }
      const monitor = new AudioLevelMonitor(AUDIO_LEVEL_BAR_COUNT);
      monitorRef.current = monitor;
      await monitor.start(setAudioLevels, { useHardware: true });
    },
    [stopMonitor],
  );

  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    stopMonitor();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, [stopMonitor]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onErrorRef.current?.(voiceInputUnavailableMessage());
      return;
    }

    stop();

    baseTextRef.current = getBaseTextRef.current?.() ?? "";
    shouldContinueRef.current = true;

    const recognition = new Ctor();
    recognition.lang = lang;
    // iOS Safari は continuous=true だと不安定なため、停止まで onend で再開する。
    recognition.continuous = !isIOS();
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const sessionText = resultsToTranscript(event.results);
      const combined = `${baseTextRef.current}${sessionText}`;
      onTranscriptRef.current(combined);
    };

    recognition.onerror = (event) => {
      shouldContinueRef.current = false;
      stopMonitor();
      setListening(false);
      recognitionRef.current = null;
      const message = speechRecognitionErrorMessage(event.error);
      if (message) onErrorRef.current?.(message);
    };

    recognition.onend = () => {
      if (shouldContinueRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          shouldContinueRef.current = false;
        }
      }
      stopMonitor();
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      // 音声認識開始後にマイク解析を起動（iOS では少し遅らせて競合を避ける）。
      void startMonitor(isIOS() ? 350 : 0);
    } catch {
      shouldContinueRef.current = false;
      stopMonitor();
      setListening(false);
      recognitionRef.current = null;
      onErrorRef.current?.("音声入力を開始できませんでした。");
    }
  }, [lang, startMonitor, stop, stopMonitor]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    speechRecognition: isSpeechRecognitionSupported(),
    listening,
    audioLevels,
    start,
    stop,
    toggle,
  };
}
