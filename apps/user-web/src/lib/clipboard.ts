/** 非 HTTPS や iOS など clipboard API が使えない環境向けの同期コピー */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.padding = "0";
  textarea.style.margin = "0";

  document.body.appendChild(textarea);

  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  return ok;
}

/** テキストをクリップボードへコピー。成功時 true。 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // クリック直後の同期処理で user gesture を維持（iOS Safari 向け）
  if (copyWithExecCommand(text)) return true;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
