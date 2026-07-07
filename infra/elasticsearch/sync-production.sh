#!/usr/bin/env bash
set -euo pipefail

# 本番 PostgreSQL → Elasticsearch へ reindex + embedding を投入する。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SQL_CREDS="$ROOT/infra/cloud-sql/.credentials"
ES_CREDS="$ROOT/infra/elasticsearch/.credentials"

if [[ ! -f "$SQL_CREDS" ]]; then
  echo "先に bash infra/cloud-sql/setup.sh を実行してください" >&2
  exit 1
fi
if [[ ! -f "$ES_CREDS" ]]; then
  echo "先に bash infra/elasticsearch/setup.sh を実行してください" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$SQL_CREDS"
# shellcheck disable=SC1090
source "$ES_CREDS"
set +a

if [[ -z "${ES_NODE:-}" ]]; then
  echo "ES_NODE が未設定です。" >&2
  exit 1
fi

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

echo "Starting Cloud SQL Auth Proxy on :${PROXY_PORT}..."
"$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT" &
PROXY_PID=$!
sleep 5

export DATABASE_URL="$DATABASE_URL_LOCAL"

echo ""
echo "Reindexing production PostgreSQL → Elasticsearch (${ES_NODE})..."
pnpm -C "$ROOT/services/backend-api" reindex

echo ""
echo "Embedding spots (Gemini)..."
pnpm -C "$ROOT/services/backend-api" embed-spots

echo ""
echo "=== Production ES sync complete ==="
