import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as loginApi } from "../api.ts";
import { setAuthSession } from "../auth.ts";
import { AdminLogo } from "../components/AdminLogo.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Input } from "../components/ui/Input.tsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("メールアドレスまたはパスワードが正しくありません");
      return;
    }

    setSubmitting(true);
    void loginApi(email, password)
      .then((res) => {
        setAuthSession(res.token, res.user);
        navigate("/spots");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        setError(
          message.includes("API に接続")
            ? message
            : "メールアドレスまたはパスワードが正しくありません",
        );
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-[#f1f5f9] to-[#e2e8f0] p-4">
      <div className="w-full max-w-[400px] rounded-xl bg-white p-10 shadow-[0_20px_20px_rgba(0,0,0,0.05)]">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <AdminLogo
            className="size-12 shrink-0 rounded-xl object-contain"
            width={48}
            height={48}
          />
          <h1 className="text-2xl font-bold text-[#0f172a]">tabipla 管理画面</h1>
          <p className="text-sm text-[#475569]">自治体向け観光コンテンツ管理</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="メールアドレス"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="admin@example.com"
          />
          <Input
            label="パスワード"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError("");
            }}
            placeholder=""
            error={error}
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "ログイン中…" : "ログイン"}
          </Button>
        </form>
      </div>
    </div>
  );
}
