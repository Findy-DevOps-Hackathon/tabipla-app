#!/usr/bin/env bash
set -euo pipefail

# 旧能登プレースホルダーを削除し、本番 Elasticsearch を reindex する。
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

echo "Deleting legacy Noto placeholder spots..."
pnpm -C "$ROOT/packages/db" exec tsx scratch/delete-legacy-noto-spots.ts

echo "Reindexing Elasticsearch from production PostgreSQL..."
pnpm -C "$ROOT/services/backend-api" reindex

echo ""
echo "Post-seed sync complete."
