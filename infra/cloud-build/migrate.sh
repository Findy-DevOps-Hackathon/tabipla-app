#!/usr/bin/env bash
# Cloud Build から Drizzle マイグレーションを Cloud SQL へ適用する。
# - Cloud SQL Auth Proxy をダウンロードして起動し、ローカル TCP 経由で接続する。
# - DATABASE_URL は Secret Manager (tabipla-database-url) から注入される。
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

CLOUD_SQL_INSTANCE="${_CLOUD_SQL_INSTANCE:-${PROJECT_ID}:asia-northeast1:tabipla-db-tokyo}"
PROXY_PORT="5432"
PROXY_VERSION="2.14.1"

echo "=== pnpm セットアップ ==="
npm install -g pnpm@10.30.3 --silent

echo "=== 依存関係インストール ==="
pnpm install --frozen-lockfile

echo "=== packages/db ビルド ==="
pnpm --filter @tabipla/db build

echo "=== Cloud SQL Auth Proxy ダウンロード (v${PROXY_VERSION}) ==="
curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
  "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v${PROXY_VERSION}/cloud-sql-proxy.linux.amd64"
chmod +x /usr/local/bin/cloud-sql-proxy

echo "=== Cloud SQL Auth Proxy 起動: ${CLOUD_SQL_INSTANCE} -> 127.0.0.1:${PROXY_PORT} ==="
/usr/local/bin/cloud-sql-proxy --port="${PROXY_PORT}" "${CLOUD_SQL_INSTANCE}" &
PROXY_PID=$!
trap 'kill "${PROXY_PID}" 2>/dev/null || true; wait "${PROXY_PID}" 2>/dev/null || true' EXIT

echo "Proxy 起動待機..."
for i in $(seq 1 20); do
  if bash -c "echo >/dev/tcp/127.0.0.1/${PROXY_PORT}" 2>/dev/null; then
    echo "  Proxy ready (${i}s)"
    break
  fi
  if [[ "$i" -eq 20 ]]; then
    echo "ERROR: Proxy が ${i}s 以内に起動しませんでした。" >&2
    exit 1
  fi
  echo "  waiting... (${i}s)"
  sleep 1
done

echo "=== DATABASE_URL を TCP 形式に変換 ==="
# Cloud Run ソケット形式:  postgresql://user:pass@/dbname?host=/cloudsql/project:region:instance
# Cloud Build TCP 形式:   postgresql://user:pass@127.0.0.1:PORT/dbname
MIGRATE_DATABASE_URL="$(
  printf '%s' "${DATABASE_URL}" \
    | sed "s|@/|@127.0.0.1:${PROXY_PORT}/|; s|?host=.*||"
)"
export DATABASE_URL="${MIGRATE_DATABASE_URL}"

echo "=== Drizzle マイグレーション実行 ==="
pnpm --filter @tabipla/db db:migrate

echo ""
echo "=== マイグレーション完了 ==="
