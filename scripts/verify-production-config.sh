#!/usr/bin/env bash
# 本番 GCP の設定を確認する（シークレットの値は表示しない）。
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-tabipla-user-web}"
REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
DEV_JWT="tabipla-dev-admin-secret"

FAIL=0
WARN=0

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }
warn() { echo "  ⚠ $1"; WARN=1; }

echo "==> 本番設定の確認（値は表示しません）"
echo "    project=${PROJECT} region=${REGION}"
echo ""

if ! command -v gcloud >/dev/null 2>&1; then
  fail "gcloud が見つかりません。Google Cloud SDK をインストールしてください。"
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  fail "gcloud 未ログインです: gcloud auth login"
  exit 1
fi

echo "--- Secret Manager（存在確認） ---"
REQUIRED_SECRETS=(
  tabipla-admin-jwt-secret
  tabipla-database-url
  tabipla-gemini-api-key
  tabipla-google-maps-api-key
)
for name in "${REQUIRED_SECRETS[@]}"; do
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    pass "${name} が存在"
  else
    warn "${name} が見つかりません（未セットアップの可能性）"
  fi
done

echo ""
echo "--- JWT（開発用でないか） ---"
if gcloud secrets describe tabipla-admin-jwt-secret --project="$PROJECT" >/dev/null 2>&1; then
  JWT_VALUE="$(gcloud secrets versions access latest \
    --secret=tabipla-admin-jwt-secret \
    --project="$PROJECT" 2>/dev/null || true)"
  if [[ -z "$JWT_VALUE" ]]; then
    warn "tabipla-admin-jwt-secret を読み取れません（権限を確認）"
  elif [[ "$JWT_VALUE" == "$DEV_JWT" ]]; then
    fail "JWT が開発用既定値のままです（要ローテーション）"
  else
    pass "JWT は開発用既定値ではありません"
  fi
  unset JWT_VALUE
else
  warn "JWT シークレット未作成のためスキップ"
fi

echo ""
echo "--- DATABASE_URL（Cloud SQL 向けか） ---"
if gcloud secrets describe tabipla-database-url --project="$PROJECT" >/dev/null 2>&1; then
  DB_URL="$(gcloud secrets versions access latest \
    --secret=tabipla-database-url \
    --project="$PROJECT" 2>/dev/null || true)"
  if [[ -z "$DB_URL" ]]; then
    warn "tabipla-database-url を読み取れません"
  elif [[ "$DB_URL" == *"/cloudsql/"* ]] || [[ "$DB_URL" == *"host=/cloudsql/"* ]]; then
    pass "DATABASE_URL は Cloud SQL ソケット形式"
  elif [[ "$DB_URL" == *"localhost"* ]] || [[ "$DB_URL" == *"127.0.0.1"* ]]; then
    fail "DATABASE_URL がローカル向けです"
  else
    warn "DATABASE_URL 形式を手動確認してください（Cloud SQL か不明）"
  fi
  unset DB_URL
fi

echo ""
echo "--- Cloud Run（公開エンドポイント） ---"
BACKEND_URL=""
if BACKEND_URL="$(gcloud run services describe tabipla-backend-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null)"; then
  pass "backend-api: ${BACKEND_URL}"
else
  warn "tabipla-backend-api を取得できません"
fi

if AGENT_URL="$(gcloud run services describe tabipla-agent \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null)"; then
  pass "agent: ${AGENT_URL}"
else
  warn "tabipla-agent を取得できません"
fi

echo ""
echo "--- 管理画面ログイン（旧パスワードが通らないか） ---"
# 旧認証情報は環境変数で渡す（リポジトリに含めない）:
#   VERIFY_LEGACY_KOMORO_EMAIL / VERIFY_LEGACY_KOMORO_PASSWORD
#   VERIFY_LEGACY_NOTO_EMAIL / VERIFY_LEGACY_NOTO_PASSWORD
if [[ -n "${BACKEND_URL:-}" ]]; then
  check_legacy_login() {
    local label="$1"
    local email="$2"
    local password="$3"
    if [[ -z "$email" || -z "$password" ]]; then
      warn "${label}: VERIFY_LEGACY_*_EMAIL/PASSWORD 未設定のためスキップ"
      return 0
    fi
    local http_code
    http_code="$(curl -sS -o /dev/null -w "%{http_code}" \
      -X POST "${BACKEND_URL}/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
      --max-time 15 || echo "000")"
    if [[ "$http_code" == "200" ]]; then
      fail "${email} が旧パスワードでログインできました（要変更）"
    elif [[ "$http_code" == "401" ]]; then
      pass "${email} は旧パスワードではログイン不可"
    else
      warn "${email} の確認失敗（HTTP ${http_code}）。CORS/到達性を確認"
    fi
  }
  check_legacy_login "komoro" "${VERIFY_LEGACY_KOMORO_EMAIL:-}" "${VERIFY_LEGACY_KOMORO_PASSWORD:-}"
  check_legacy_login "noto" "${VERIFY_LEGACY_NOTO_EMAIL:-}" "${VERIFY_LEGACY_NOTO_PASSWORD:-}"
else
  warn "backend-api URL がないためログイン確認をスキップ"
fi

echo ""
echo "--- Monitoring アラートポリシー ---"
POLICIES="$(gcloud alpha monitoring policies list \
  --project="$PROJECT" \
  --filter='displayName:tabipla-' \
  --format='value(displayName)' 2>/dev/null || true)"
if [[ -n "$POLICIES" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && pass "アラート: ${line}"
  done <<< "$POLICIES"
else
  warn "tabipla-* アラートが見つかりません（infra/monitoring/setup-gcp.sh 未実行の可能性）"
fi

echo ""
if [[ "$FAIL" -eq 0 && "$WARN" -eq 0 ]]; then
  echo "==> 本番チェック: OK"
  exit 0
fi
if [[ "$FAIL" -eq 0 ]]; then
  echo "==> 本番チェック: 警告あり（要確認）"
  exit 0
fi
echo "==> 本番チェック: 要修正"
exit 1
