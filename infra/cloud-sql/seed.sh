#!/usr/bin/env bash
set -euo pipefail

# Cloud SQL Auth Proxy 経由で開発用管理ユーザー等を seed する。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/cloud-sql/.credentials"

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "先に bash infra/cloud-sql/setup.sh を実行してください" >&2
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
  echo "  brew install cloud-sql-proxy" >&2
  exit 1
fi

echo "Starting Cloud SQL Auth Proxy on 127.0.0.1:${PROXY_PORT} ..."
"$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT" &
PROXY_PID=$!

sleep 5

export DATABASE_URL="$DATABASE_URL_LOCAL"
echo "Running seed (DATABASE_URL -> 127.0.0.1:${PROXY_PORT})..."
pnpm -C "$ROOT/packages/db" seed

echo ""
echo "Seed complete."
