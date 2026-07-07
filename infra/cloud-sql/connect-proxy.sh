#!/usr/bin/env bash
set -euo pipefail

# ローカルから Cloud SQL へ接続する Auth Proxy を起動する（フォアグラウンド）。
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

if ! command -v "$PROXY_BIN" >/dev/null 2>&1; then
  echo "cloud-sql-proxy が見つかりません。" >&2
  echo "  brew install cloud-sql-proxy" >&2
  exit 1
fi

echo "Proxy: ${CONNECTION_NAME} -> 127.0.0.1:${PROXY_PORT}"
echo "DATABASE_URL=${DATABASE_URL_LOCAL}"
echo ""
exec "$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT"
