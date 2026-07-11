#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

echo "==> Public 化向け検証"
echo ""

echo "--- 必須ファイル ---"
for f in LICENSE SECURITY.md .gitleaks.toml; do
  if [[ -f "$f" ]]; then pass "$f"; else fail "$f が見つかりません"; fi
done

echo ""
echo "--- 秘密情報ファイルの git 追跡 ---"
TRACKED_ENV="$(git ls-files '*.env' '**/.env' 'infra/*/.credentials' 2>/dev/null || true)"
if [[ -z "$TRACKED_ENV" ]]; then
  pass ".env / .credentials は git 未追跡"
else
  fail "git に追跡されている秘密情報ファイルがあります:"
  echo "$TRACKED_ENV"
fi

echo ""
echo "--- gitleaks ---"
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --source="$ROOT" --config="$ROOT/.gitleaks.toml" --redact --verbose; then
    pass "gitleaks: leak なし"
  else
    fail "gitleaks: 検出あり"
  fi
else
  echo "  ⚠ gitleaks 未インストール（スキップ）。CI または brew install gitleaks を推奨"
fi

echo ""
echo "--- 簡易パターン検索（追跡ファイルのみ） ---"
SUSPICIOUS="$(git grep -n -E 'AIza[0-9A-Za-z_-]{20,}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]+' -- ':!pnpm-lock.yaml' 2>/dev/null || true)"
if [[ -z "$SUSPICIOUS" ]]; then
  pass "API キー形式の文字列なし"
else
  fail "疑わしい文字列:"
  echo "$SUSPICIOUS"
fi

echo ""
echo "--- 本番確認（手動） ---"
echo "  次を docs/public-release-checklist.md に従って確認してください:"
echo "    - tabipla-admin-jwt-secret が開発用でないこと"
echo "    - 本番 admin パスワードが seed 既定値でないこと"
echo "    - GCP 課金・クォータアラート"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "==> リポジトリ内チェック: OK"
  exit 0
fi

echo "==> リポジトリ内チェック: 要修正"
exit 1
