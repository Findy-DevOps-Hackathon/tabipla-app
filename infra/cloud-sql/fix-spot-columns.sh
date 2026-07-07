#!/usr/bin/env bash
set -euo pipefail

# 0009 マイグレーション漏れで不足している spots カラムを補完する。
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

"$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT" &
PROXY_PID=$!
sleep 5

export DATABASE_URL="$DATABASE_URL_LOCAL"
pnpm -C "$ROOT/packages/db" exec tsx scratch/add-missing-spot-columns.ts
