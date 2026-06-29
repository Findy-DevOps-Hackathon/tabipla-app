import { useEffect, useRef, useState } from "react";
import { getSpotTrivia, type Recommendation } from "../data/spots.ts";
import { copyToClipboard } from "../lib/clipboard.ts";
import { buildSpotShareUrl } from "../lib/spotLink.ts";
import { useLockBodyScroll } from "../lib/useLockBodyScroll.ts";
import { useVisualViewport } from "../lib/useVisualViewport.ts";
import {
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  MapPinIcon,
  MicIcon,
  SendIcon,
  ShareIcon,
} from "./icons.tsx";

type ChatMessage = {
  role: "user" | "ai";
  text: string;
  isError?: boolean;
  /** ユーザーが添付した画像（data URL） */
  image?: string;
};

type SpotDetailModalProps = {
  recommendation: Recommendation;
  /** チャット履歴 */
  chatHistory: ChatMessage[];
  /** チャット発言送信 */
  onSendChat: (
    text: string,
    img?: { mimeType: string; data: string } | null,
    audio?: { mimeType: string; data: string } | null,
  ) => Promise<void>;
  /** 閉じる（戻る）操作。 */
  onClose: () => void;
};

/** おすすめ候補をタップしたときに表示するスポット詳細（フルスクリーン）。 */
export function SpotDetailModal({
  recommendation: rec,
  chatHistory,
  onSendChat,
  onClose,
}: SpotDetailModalProps) {
  useLockBodyScroll();
  // iOS Safari は input フォーカス時に position:fixed が壊れ、ドキュメントを勝手にスクロールして
  // しまう（スクロール・タップが効かなくなる）。そこでキーボード表示中だけモーダルの高さ・位置を
  // 「見えている領域（visualViewport）」へ合わせ、入力欄を常にキーボードの上に置く。
  // キーボードを閉じている間は全画面（inset-0）のままにして見た目の崩れを防ぐ。
  const viewport = useVisualViewport();
  const layoutHeight = typeof window !== "undefined" ? window.innerHeight : viewport.height;
  const keyboardInset = Math.max(0, layoutHeight - viewport.height - viewport.offsetTop);
  const keyboardOpen = keyboardInset > 100;
  const trivia = getSpotTrivia(rec.id);

  // チャット用のローカルステート
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたら、モーダル全体を最下部までスクロールして最新の発言を表示する。
  // 初回表示（履歴なし）では勝手にスクロールしないよう、履歴があるときだけ実行する。
  useEffect(() => {
    if (chatHistory.length === 0) return;
    const el = scrollContainerRef.current;
    // 即時スクロール（smooth は iOS でタッチ操作を奪い、スクロールが固まる原因になる）。
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatHistory]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      if (shareResetTimerRef.current) clearTimeout(shareResetTimerRef.current);
    };
  }, []);

  async function handleCopyName() {
    const ok = await copyToClipboard(rec.name);
    if (!ok) return;
    setNameCopied(true);
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => setNameCopied(false), 2000);
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${rec.prefecture}${rec.area} ${rec.name}`,
  )}`;

  async function handleShare() {
    const appUrl = typeof window !== "undefined" ? buildSpotShareUrl(rec.id) : "";

    try {
      if (navigator.share) {
        await navigator.share({ title: rec.name, url: appUrl });
        return;
      }
      const ok = await copyToClipboard(appUrl);
      if (!ok) return;
      setShareCopied(true);
      if (shareResetTimerRef.current) clearTimeout(shareResetTimerRef.current);
      shareResetTimerRef.current = setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  // --- 音声録音処理 --------------------------------------------------------
  async function handleMicToggle() {
    if (!isRecording) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("このブラウザ・環境では録音機能がサポートされていません。");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = (reader.result as string).split(",")[1] || "";
            onSendChat("", null, { mimeType: "audio/webm", data: base64data });
          };
          reader.readAsDataURL(audioBlob);
          stream.getTracks().forEach((track) => {
            track.stop();
          });
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "マイクのアクセスに失敗しました。");
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  }

  // --- テキスト送信 ----------------------------------------------------
  function handleSendText() {
    const text = textInput.trim();
    if (!text) return;

    onSendChat(text, null, null);
    setTextInput("");
  }

  return (
    <div
      className="fixed inset-0 z-30 flex justify-center"
      style={
        keyboardOpen
          ? { top: viewport.offsetTop, height: viewport.height, bottom: "auto" }
          : undefined
      }
    >
      <div className="flex h-full w-full max-w-[500px] flex-col overflow-hidden bg-white">
        <div
          ref={scrollContainerRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          <div className="relative aspect-16/11 w-full shrink-0">
            <img
              src={rec.image}
              alt={rec.name}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-black/20" />

            <button
              type="button"
              onClick={onClose}
              aria-label="戻る"
              className="absolute left-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-sm transition active:scale-95"
            >
              <ChevronLeftIcon className="size-6 mr-0.5" />
            </button>

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 pr-28">
              <span className="w-fit rounded-md bg-slate-600/90 px-2 py-[3px] text-[12px] font-bold text-white">
                {rec.category}
              </span>
              <p className="text-[12px] font-medium text-white/85">
                {rec.prefecture} / {rec.area}
              </p>
              <p className="text-[24px] font-extrabold leading-tight text-white drop-shadow-sm">
                {rec.name}
              </p>
            </div>

            <div className="absolute bottom-3 right-4 z-10 flex gap-2">
              <button
                type="button"
                onClick={handleCopyName}
                aria-label={nameCopied ? "コピーしました" : "スポット名をコピー"}
                className="flex size-11 items-center justify-center rounded-full bg-white/20 text-white transition active:scale-95 hover:bg-white/30"
              >
                {nameCopied ? <CheckIcon className="size-5" /> : <CopyIcon className="size-5" />}
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label={shareCopied ? "コピーしました" : "スポットを共有"}
                className="flex size-11 items-center justify-center rounded-full bg-white/20 text-white transition active:scale-95 hover:bg-white/30"
              >
                {shareCopied ? <CheckIcon className="size-5" /> : <ShareIcon className="size-5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-1.5">
              <p className="text-[13px] font-bold text-[#0f172a]">スポット紹介</p>
              <p className="text-[14px] leading-[1.6] text-[#475569]">{rec.description}</p>
            </section>

            {trivia && (
              <section className="flex items-start gap-2">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[13px] font-bold text-[#0f172a]">おすすめポイント</p>
                  <p className="text-[13px] leading-normal text-[#475569]">{trivia}</p>
                </div>
              </section>
            )}

            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <MapPinIcon className="size-4 shrink-0 text-(--brand)" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-bold text-[#0f172a]">Googleマップで開く</span>
                  <span className="text-[11px] text-[#94a3b8]">
                    {rec.prefecture}
                    {rec.area}
                  </span>
                </span>
              </span>
              <span className="text-[11px] font-medium text-(--brand)">地図を見る</span>
            </a>

            {/* AIチャットセクション（個別画面内に移植） */}
            <section className="flex flex-col gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#0f172a]">
                  AIガイドに質問する
                </p>
                <p className="text-[11px] text-[#7788a0]">
                  正確な情報は公式サイトをご確認ください。
                </p>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-[#e2e8f0] bg-white p-3">
                {/* メッセージ履歴（モーダル全体で1つのスクロールにするため内部スクロールはしない） */}
                <div className="flex flex-col gap-2.5 pr-1 text-[13px]">
                  {(chatHistory.length > 0
                    ? chatHistory
                    : [
                        {
                          role: "ai" as const,
                          text: "このスポットについて、気になることを聞いてみてください。",
                        },
                      ]
                  ).map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={`${m.role}-${m.text}-${m.image ?? ""}`}
                        className={`flex max-w-[85%] flex-col gap-1.5 whitespace-pre-wrap rounded-xl px-3 py-2 leading-relaxed ${
                          isUser
                            ? "self-end rounded-tr-none bg-(--brand) text-white"
                            : m.isError
                              ? "self-start rounded-tl-none border border-rose-100 bg-rose-50 text-rose-600"
                              : "self-start rounded-tl-none bg-(--ai-bg) text-(--ai-fg)"
                        }`}
                      >
                        {m.image && (
                          <img
                            src={m.image}
                            alt="添付画像"
                            className="max-h-40 w-full rounded-lg object-cover"
                          />
                        )}
                        {m.text && <span>{m.text}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* 入力バー（スクロール領域の外に固定し、メッセージ件数やキーボードに関わらず常に操作可能にする） */}
        <div className="shrink-0 border-t border-[#e2e8f0] bg-white p-3">
          <div className="flex items-center gap-2 text-[13px]">
            <button
              type="button"
              onClick={handleMicToggle}
              aria-label={isRecording ? "録音を停止して送信" : "音声で話す"}
              className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                isRecording
                  ? "animate-pulse border-rose-500 bg-rose-500 text-white"
                  : "border-[#e2e8f0] bg-white text-[#475569] hover:bg-(--page)"
              }`}
            >
              <MicIcon className="size-5" />
            </button>

            {/* テキスト入力 */}
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendText();
              }}
              placeholder="知りたいことを質問..."
              className="min-w-0 flex-1 rounded-full border border-[#e2e8f0] bg-white px-3.5 py-2 text-[16px] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-(--brand) focus:outline-none"
            />

            <button
              type="button"
              onClick={handleSendText}
              aria-label="送信"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--brand) text-white transition hover:opacity-90 active:scale-95"
            >
              <SendIcon className="size-5 -ml-0.5 -mb-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
