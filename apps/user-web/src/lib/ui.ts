/**
 * トンマナ統一のための共有 UI スタイル。
 *
 * ボタンの「色・字面（ブランドの見た目）」をここに集約し、各画面はサイズ
 * （高さ・パディング・文字サイズ）だけを付け足して使う。これにより主アクションの
 * 配色が画面ごとにブレるのを防ぐ。
 *
 * 色は index.css の :root トークン（--brand-from / --brand-to など）を参照する。
 *
 * 使い方:
 *   <button className={`${PRIMARY_BUTTON} h-[52px] text-[16px]`}>探す</button>
 */

/**
 * 主アクション（最重要 CTA）の見た目。ブランドの緑ティールのグラデーション。
 * サイズ（高さ・パディング・文字サイズ・字間）は呼び出し側で付け足す。
 */
export const PRIMARY_BUTTON =
  "flex w-full items-center justify-center gap-2 rounded-full bg-linear-to-r from-(--brand-from) to-(--brand-to) font-extrabold text-white shadow-[0_8px_24px_-6px_rgba(10,161,155,0.6)] transition active:scale-[0.98] disabled:opacity-40";

/**
 * 中立操作（戻る・キャンセル・閉じるなど）。白地＋枠のセカンダリボタン。
 * サイズは呼び出し側で付け足す。
 */
export const SECONDARY_BUTTON =
  "flex w-full items-center justify-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white font-semibold text-[#475569] shadow-sm transition active:scale-[0.98] active:bg-[#f1f5f9]";
