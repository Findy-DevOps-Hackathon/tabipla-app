#!/usr/bin/env bash
# Cloud SQL 上の管理ユーザーパスワードを更新する（値は Secret Manager に保存可能）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS_FILE="$ROOT/infra/cloud-sql/.credentials"
EMAIL="${1:-}"
PROJECT="${GOOGLE_CLOUD_PROJECT:-tabipla-user-web}"
SECRET_NAME="${ADMIN_PASSWORD_SECRET_NAME:-}"

if [[ -z "$EMAIL" ]]; then
  echo "使い方: bash scripts/rotate-admin-password.sh <email>" >&2
  echo "  例: bash scripts/rotate-admin-password.sh <admin-email>" >&2
  exit 1
fi

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "infra/cloud-sql/.credentials がありません。先に setup.sh を実行してください。" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CREDS_FILE"

PROXY_BIN="${CLOUD_SQL_PROXY_BIN:-cloud-sql-proxy}"
PROXY_PORT="${CLOUD_SQL_PROXY_PORT:-5434}"
PROXY_PID=""

cleanup() {
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! command -v "$PROXY_BIN" >/dev/null 2>&1; then
  echo "cloud-sql-proxy が見つかりません。" >&2
  exit 1
fi

if [[ -z "${ADMIN_NEW_PASSWORD:-}" ]]; then
  ADMIN_NEW_PASSWORD="$(openssl rand -base64 24 | tr -d '\n' | tr '/+=' 'Aa1')"
fi

echo "Starting Cloud SQL Auth Proxy on 127.0.0.1:${PROXY_PORT} ..."
"$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT" &
PROXY_PID=$!
sleep 5

export DATABASE_URL="$DATABASE_URL_LOCAL"
export ADMIN_NEW_PASSWORD
pnpm -C "$ROOT/packages/db" exec tsx --env-file-if-exists=.env src/rotateAdminPassword.ts "$EMAIL"

if [[ -n "$SECRET_NAME" ]]; then
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$ADMIN_NEW_PASSWORD" | gcloud secrets versions add "$SECRET_NAME" \
      --project="$PROJECT" \
      --data-file=- \
      --quiet
  else
    printf '%s' "$ADMIN_NEW_PASSWORD" | gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT" \
      --replication-policy=automatic \
      --data-file=- \
      --quiet
  fi
  echo "Secret Manager: ${SECRET_NAME} に保存しました（gcloud secrets versions access latest で取得）"
fi

unset ADMIN_NEW_PASSWORD
echo "完了: ${EMAIL} のパスワードを更新しました。"
