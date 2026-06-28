import { useRef, useState } from "react";
import type { Recommendation } from "../data/spots.ts";
import { categoryBadgeClass } from "../lib/category.ts";
import { useLockBodyScroll } from "../lib/useLockBodyScroll.ts";
import { CheckIcon, ChevronLeftIcon, MapPinIcon, SparklesIcon } from "./icons.tsx";

type ChatMessage = {
  role: "user" | "ai";
  text: string;
  isError?: boolean;
};

type SpotDetailModalProps = {
  recommendation: Recommendation;
  /** このスポットが「行った」済みか。 */
  visited: boolean;
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
  /** 「行った」トグル時。 */
  onToggleVisited: (recommendation: Recommendation) => void;
};

/** おすすめ候補をタップしたときに表示するスポット詳細（フルスクリーン）。 */
export function SpotDetailModal({
  recommendation: rec,
  visited,
  chatHistory,
  onSendChat,
  onClose,
  onToggleVisited,
}: SpotDetailModalProps) {
  useLockBodyScroll();

  // チャット用のローカルステート
  const [textInput, setTextInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<{
    mimeType: string;
    data: string;
    url: string;
  } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${rec.prefecture}${rec.area} ${rec.name}`,
  )}`;

  // --- 音声録音処理 --------------------------------------------------------
  async function handleMicToggle() {
    if (!isRecording) {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err: any) {
        alert(err.message || "マイクのアクセスに失敗しました。");
      }
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  }

  // --- 画像添付処理 --------------------------------------------------------
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(",")[1] || "";
      setSelectedImage({
        mimeType: file.type,
        data: base64data,
        url: URL.createObjectURL(file),
      });
    };
    reader.readAsDataURL(file);
  }

  // --- テキスト/画像送信 ----------------------------------------------------
  function handleSendText() {
    const text = textInput.trim();
    if (!text && !selectedImage) return;

    onSendChat(text, selectedImage, null);
    setTextInput("");
    setSelectedImage(null);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-center">
      <div className="flex h-full w-full max-w-[500px] flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
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
              className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#0f172a] shadow-sm transition active:scale-95"
            >
              <ChevronLeftIcon className="size-5" />
            </button>

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
              <span
                className={`w-fit rounded-md px-2 py-[3px] text-[12px] font-bold ${categoryBadgeClass(
                  rec.category,
                )}`}
              >
                {rec.category}
              </span>
              <p className="text-[12px] font-medium text-white/85">
                {rec.prefecture} / {rec.area}
              </p>
              <p className="text-[24px] font-extrabold leading-tight text-white drop-shadow-sm">
                {rec.name}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <section className="flex flex-col gap-1.5">
              <p className="text-[13px] font-bold text-[#0f172a]">スポット紹介</p>
              <p className="text-[14px] leading-[1.6] text-[#475569]">{rec.description}</p>
            </section>

            <section className="flex items-start gap-2 rounded-xl bg-(--ai-bg) px-3 py-2.5">
              <SparklesIcon className="mt-0.5 size-4 shrink-0 text-(--ai-fg)" />
              <div className="flex flex-col gap-0.5">
                <p className="text-[12px] font-bold text-(--ai-fg)">おすすめ理由</p>
                <p className="text-[13px] leading-normal text-(--ai-fg)">{rec.reason}</p>
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-[13px] font-bold text-[#0f172a]">タグ</p>
              <div className="flex flex-wrap gap-1.5">
                {rec.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[#e2e8f0] px-2 py-1 text-[12px] text-[#475569]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </section>

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
            <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-inner mt-2">
              <h4 className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                💬 AIガイドに質問する
              </h4>

              {/* メッセージ履歴 */}
              <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1 text-[13px]">
                {(chatHistory.length > 0
                  ? chatHistory
                  : [
                      {
                        role: "ai" as const,
                        text: "このスポットについて、気になることや楽しみ方を聞いてみてください。写真や音声での質問も受け付けます！",
                      },
                    ]
                ).map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                        isUser
                          ? "bg-teal-600 text-white self-end rounded-tr-none"
                          : m.isError
                            ? "bg-red-50 text-red-600 border border-red-100 self-start rounded-tl-none"
                            : "bg-slate-100 text-slate-700 self-start rounded-tl-none"
                      }`}
                    >
                      {m.text}
                    </div>
                  );
                })}
              </div>

              {/* 画像添付プレビュー */}
              {selectedImage && (
                <div className="relative w-20 h-20 border border-slate-200 rounded-lg overflow-hidden">
                  <img
                    src={selectedImage.url}
                    alt="添付プレビュー"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white text-[10px] font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 送信フォーム */}
              <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-[13px]">
                {/* カメラ画像アップロード */}
                <label
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white hover:bg-slate-100 text-[16px] transition shrink-0 shadow-xs animate-none"
                  title="写真を送る"
                >
                  📸
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>

                {/* マイク音声録音 */}
                <button
                  type="button"
                  onClick={handleMicToggle}
                  className={`flex size-9 items-center justify-center rounded-full text-[16px] transition shrink-0 shadow-xs ${
                    isRecording
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white hover:bg-slate-100"
                  }`}
                  title={isRecording ? "録音を停止して送信" : "音声で話しかける"}
                >
                  🎙️
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
                  className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 focus:outline-teal-600 focus:ring-0 text-[13px] bg-white"
                />

                <button
                  type="button"
                  onClick={handleSendText}
                  className="rounded-full bg-teal-600 px-3.5 py-1.5 font-bold text-white hover:bg-teal-700 transition shrink-0 shadow-xs"
                >
                  送信
                </button>
              </div>
            </section>
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#e2e8f0] bg-white px-4 pb-6 pt-4">
          <button
            type="button"
            onClick={() => onToggleVisited(rec)}
            aria-pressed={visited}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-bold transition active:scale-[0.99] ${
              visited
                ? "bg-[#059669] text-white"
                : "border border-[#cbd5e1] bg-white text-[#475569]"
            }`}
          >
            <CheckIcon className="size-4" />
            {visited ? "行った" : "行った？"}
          </button>
        </div>
      </div>
    </div>
  );
}
