import { useState } from "react";
import {
  AuthError,
  deleteAccount,
  login,
  register,
  type UserAccount,
  verifyCredentials,
} from "../auth.ts";
import { ChevronLeftIcon, EyeIcon, EyeOffIcon } from "../components/icons.tsx";
import { DANGER_BUTTON, PRIMARY_BUTTON } from "../lib/ui.ts";
import { useLockBodyScroll } from "../lib/useLockBodyScroll.ts";
import {
  PASSWORD_MIN,
  validateEmail,
  validateLoginPassword,
  validateName,
  validatePassword,
} from "../lib/validation.ts";

type AuthMode = "login" | "register";
/** 表示中のビュー。ログイン/登録 or 退会ページ。 */
type AuthView = "auth" | "delete";

type AuthScreenProps = {
  /** ログイン/登録に成功したとき。 */
  onAuthenticated: (user: UserAccount) => void;
  /** 表示する理由（例: 履歴保存のため）。指定時はバナーを出す。 */
  reason?: string;
  /** 閉じる/キャンセル。指定時は右上に閉じるボタンを出す。 */
  onCancel?: () => void;
};

/** フィールド 1 つ分の入力 UI。 */
function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  hint,
}: {
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  // パスワード欄は表示/非表示を切り替えられるようにする。
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const inputType = isPassword ? (revealed ? "text" : "password") : type;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#475569]">{label}</span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={`h-12 w-full rounded-2xl border bg-white text-[16px] text-[#0f172a] outline-none transition focus:ring-2 placeholder:text-[#94a3b8] ${
            isPassword ? "pl-4 pr-12" : "px-4"
          } ${
            error
              ? "border-[#fda4af] focus:border-[#e11d48] focus:ring-[#e11d48]/10"
              : "border-[#cbd5e1] focus:border-[#0f172a] focus:ring-[#0f172a]/10"
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "パスワードを隠す" : "パスワードを表示"}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#94a3b8] transition active:opacity-60"
          >
            {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        )}
      </div>
      {error ? (
        <span className="text-[12px] text-[#be123c]">{error}</span>
      ) : hint ? (
        <span className="text-[12px] text-[#94a3b8]">{hint}</span>
      ) : null}
    </label>
  );
}

/** ログイン / 新規会員登録の画面（履歴保存時などにプロンプトとして表示）。 */
export function AuthScreen({ onAuthenticated, reason, onCancel }: AuthScreenProps) {
  useLockBodyScroll();

  const [view, setView] = useState<AuthView>("auth");
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  // 退会フロー。本人確認中・確認ダイアログの表示・削除中・完了メッセージ。
  const [verifying, setVerifying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  const isRegister = mode === "register";

  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
    setNotice("");
    setFieldErrors({});
  }

  // 退会ページを開く。入力内容はクリアして専用フォームから入力し直してもらう。
  function openDelete() {
    setView("delete");
    setError("");
    setNotice("");
    setFieldErrors({});
    setEmail("");
    setPassword("");
  }

  // 退会ページからログイン/登録に戻る。
  function closeDelete() {
    setView("auth");
    setConfirmDelete(false);
    setError("");
    setFieldErrors({});
    setEmail("");
    setPassword("");
  }

  // 退会ページの送信。メール・パスワードが正しいか本人確認し、OK なら確認モーダルを開く。
  async function handleVerifyForDelete(e: React.FormEvent) {
    e.preventDefault();
    if (verifying) return;

    setError("");
    const next = {
      email: validateEmail(email) ?? undefined,
      password: validateLoginPassword(password) ?? undefined,
    };
    setFieldErrors(next);
    if (next.email || next.password) return;

    setVerifying(true);
    try {
      await verifyCredentials({ email, password });
      setConfirmDelete(true);
    } catch (err) {
      setError(
        err instanceof AuthError ? err.message : "エラーが発生しました。もう一度お試しください。",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAccount({ email, password });
      setConfirmDelete(false);
      setView("auth");
      setMode("login");
      setEmail("");
      setPassword("");
      setNotice("退会が完了しました。\nご利用ありがとうございました。");
    } catch (err) {
      setConfirmDelete(false);
      setError(
        err instanceof AuthError ? err.message : "エラーが発生しました。もう一度お試しください。",
      );
    } finally {
      setDeleting(false);
    }
  }

  function validateAll(): boolean {
    const next: { name?: string; email?: string; password?: string } = {};
    if (isRegister) {
      next.name = validateName(name) ?? undefined;
    }
    next.email = validateEmail(email) ?? undefined;
    next.password =
      (isRegister ? validatePassword(password) : validateLoginPassword(password)) ?? undefined;

    setFieldErrors(next);
    return !next.name && !next.email && !next.password;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError("");
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const user = await (isRegister
        ? register({ name, email, password })
        : login({ email, password }));
      onAuthenticated(user);
    } catch (err) {
      setError(
        err instanceof AuthError ? err.message : "エラーが発生しました。もう一度お試しください。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "delete") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8 pt-5">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={closeDelete}
            aria-label="戻る"
            className="-ml-2 flex size-9 items-center justify-center rounded-full text-[#64748b] transition active:opacity-60"
          >
            <ChevronLeftIcon className="size-6" />
          </button>
        </div>

        <div className="pt-3">
          <h1 className="text-[24px] font-black text-[#0f172a]">退会（アカウント削除）</h1>
          <p className="mt-2 text-[13px] leading-[1.7] text-[#64748b]">
            退会するアカウントのメールアドレスとパスワードを入力してください。
            <br />
            本人確認のあと、アカウントと履歴をすべて削除します。
          </p>
        </div>

        <form onSubmit={handleVerifyForDelete} className="mt-6 flex flex-col gap-4">
          <Field
            label="メールアドレス"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError("");
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="taro@example.com"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <Field
            label="パスワード"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError("");
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            autoComplete="current-password"
            error={fieldErrors.password}
          />

          {error && (
            <p className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-2.5 text-[13px] text-[#be123c]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={verifying}
            className={`${DANGER_BUTTON} mt-2 h-[52px] text-[16px]`}
          >
            {verifying ? "確認中…" : "退会手続きへ進む"}
          </button>
          <button
            type="button"
            onClick={closeDelete}
            className="flex h-12 w-full items-center justify-center rounded-full text-[14px] font-semibold text-[#64748b] transition active:bg-[#f1f5f9]"
          >
            ログインに戻る
          </button>
        </form>

        {confirmDelete && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-6">
            <div className="flex w-full max-w-[330px] flex-col gap-5 rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.3)]">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-[16px] font-extrabold text-[#0f172a]">退会しますか？</p>
                <p className="text-[13px] leading-[1.6] text-[#64748b]">
                  <span className="font-bold text-[#0f172a]">{email}</span>
                  <br />
                  のアカウントと履歴をすべて削除します。
                  <br />
                  この操作は取り消せません。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`${DANGER_BUTTON} h-12 text-[15px]`}
                >
                  {deleting ? "削除中…" : "退会して削除する"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex h-12 w-full items-center justify-center rounded-full text-[14px] font-semibold text-[#64748b] transition active:bg-[#f1f5f9] disabled:opacity-60"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8 pt-5">
      <div className={`flex flex-col gap-3 ${onCancel ? "pt-1" : "pt-7"}`}>
        <div className="relative flex min-h-9 items-center justify-center">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="戻る"
              className="absolute left-0 -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-[#64748b] transition active:opacity-60"
            >
              <ChevronLeftIcon className="size-6" />
            </button>
          )}
          <p className="bg-linear-to-r from-[#23ac73] to-[#0aa19b] bg-clip-text text-[30px] font-black text-transparent">
            tabipla
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[13px] text-[#64748b]">あなたの好みを記憶し、おすすめスポットを提案</p>
          <p className="text-[13px] text-[#64748b]">行った履歴も保存できます</p>
        </div>
      </div>

      {reason && (
        <p className="mt-5 rounded-xl border border-[#bae6fd] bg-[#f0f9ff] px-4 py-2.5 text-center text-[13px] text-[#0369a1]">
          {reason}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
        {isRegister && (
          <Field
            label="お名前"
            type="text"
            value={name}
            onChange={(v) => {
              setName(v);
              setError("");
              setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="旅 太郎"
            autoComplete="name"
            error={fieldErrors.name}
          />
        )}
        <Field
          label="メールアドレス"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setError("");
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          placeholder="taro@example.com"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <Field
          label="パスワード"
          type="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setError("");
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          placeholder={isRegister ? `${PASSWORD_MIN}文字以上` : ""}
          autoComplete={isRegister ? "new-password" : "current-password"}
          error={fieldErrors.password}
          hint={isRegister ? `${PASSWORD_MIN}文字以上・英字と数字を含めてください` : undefined}
        />

        {notice && (
          <p className="whitespace-pre-line rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-2.5 text-[13px] text-[#15803d]">
            {notice}
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-2.5 text-[13px] text-[#be123c]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`${PRIMARY_BUTTON} mt-2 h-[52px] text-[16px]`}
        >
          {submitting
            ? isRegister
              ? "登録中…"
              : "ログイン中…"
            : isRegister
              ? "登録して始める"
              : "ログイン"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#64748b]">
        {isRegister ? "すでにアカウントをお持ちですか？" : "アカウントをお持ちでないですか？"}{" "}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? "login" : "register")}
          className="font-bold text-[#0f172a] underline-offset-2 hover:underline"
        >
          {isRegister ? "ログイン" : "新規登録"}
        </button>
      </p>

      <div className="mt-auto flex flex-col items-center gap-1 pt-8">
        <button
          type="button"
          onClick={openDelete}
          className="text-[13px] font-semibold text-[#be123c] underline-offset-2 transition hover:underline active:opacity-60"
        >
          退会（アカウント削除）
        </button>
      </div>
    </div>
  );
}
