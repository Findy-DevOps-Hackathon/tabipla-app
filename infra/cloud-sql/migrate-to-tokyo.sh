#!/usr/bin/env bash
set -euo pipefail

# us-central1 の Cloud SQL から asia-northeast1（東京）へ pg_dump / pg_restore で移行する。
# 移行先インスタンス名は既定 tabipla-db-tokyo（旧 tabipla-db と共存可能）。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/cloud-sql/.credentials"
DUMP_FILE="${MIGRATE_DUMP_FILE:-/tmp/tabipla-cloudsql-tokyo.dump}"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

OLD_INSTANCE="${OLD_CLOUD_SQL_INSTANCE_NAME:-tabipla-db}"
OLD_REGION="${OLD_CLOUD_SQL_REGION:-us-central1}"
NEW_REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
NEW_INSTANCE="${NEW_CLOUD_SQL_INSTANCE_NAME:-tabipla-db-tokyo}"
DB_NAME="${CLOUD_SQL_DB_NAME:-tabipla}"
DB_USER="${CLOUD_SQL_DB_USER:-tabipla}"

PROXY_BIN="${CLOUD_SQL_PROXY_BIN:-cloud-sql-proxy}"
OLD_PROXY_PORT="${OLD_CLOUD_SQL_PROXY_PORT:-5434}"
NEW_PROXY_PORT="${NEW_CLOUD_SQL_PROXY_PORT:-5435}"

# Homebrew postgresql@16 を優先（Cloud SQL POSTGRES_16 と pg_dump バージョンを合わせる）
if [[ -d /opt/homebrew/opt/postgresql@16/bin ]]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:${PATH}"
elif [[ -d /usr/local/opt/postgresql@16/bin ]]; then
  export PATH="/usr/local/opt/postgresql@16/bin:${PATH}"
fi

if ! command -v "$PROXY_BIN" >/dev/null 2>&1; then
  echo "cloud-sql-proxy が見つかりません: brew install cloud-sql-proxy" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_dump / pg_restore が必要です: brew install libpq" >&2
  exit 1
fi

if ! gcloud sql instances describe "$OLD_INSTANCE" --project="$PROJECT" >/dev/null 2>&1; then
  echo "旧インスタンス '${OLD_INSTANCE}' が見つかりません。" >&2
  echo "新規に東京で作る場合: GOOGLE_CLOUD_LOCATION=asia-northeast1 bash infra/cloud-sql/setup.sh" >&2
  exit 1
fi

OLD_CONNECTION="$(gcloud sql instances describe "$OLD_INSTANCE" \
  --project="$PROJECT" \
  --format='value(connectionName)')"
OLD_INSTANCE_REGION="$(gcloud sql instances describe "$OLD_INSTANCE" \
  --project="$PROJECT" \
  --format='value(region)')"

echo "=== Cloud SQL 東京移行 ==="
echo "Project:     ${PROJECT}"
echo "Source:      ${OLD_INSTANCE} (${OLD_INSTANCE_REGION})"
echo "Destination: ${NEW_INSTANCE} (${NEW_REGION})"
echo ""

if [[ "$OLD_INSTANCE_REGION" == "$NEW_REGION" && "$OLD_INSTANCE" == "$NEW_INSTANCE" ]]; then
  echo "既に ${NEW_REGION} の ${NEW_INSTANCE} です。移行は不要です。" >&2
  exit 0
fi

read -r -p "続行しますか？ [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "中止しました。"
  exit 0
fi

OLD_PROXY_PID=""
NEW_PROXY_PID=""

cleanup() {
  if [[ -n "$OLD_PROXY_PID" ]] && kill -0 "$OLD_PROXY_PID" 2>/dev/null; then
    kill "$OLD_PROXY_PID" 2>/dev/null || true
    wait "$OLD_PROXY_PID" 2>/dev/null || true
  fi
  if [[ -n "$NEW_PROXY_PID" ]] && kill -0 "$NEW_PROXY_PID" 2>/dev/null; then
    kill "$NEW_PROXY_PID" 2>/dev/null || true
    wait "$NEW_PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ -f "$CREDS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
fi

DB_PASSWORD="${DB_PASSWORD:-}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "DB パスワードが必要です。infra/cloud-sql/.credentials の DB_PASSWORD を確認してください。" >&2
  exit 1
fi

echo ""
echo "[1/5] 旧 DB (${OLD_INSTANCE}) からダンプ..."
"$PROXY_BIN" "$OLD_CONNECTION" --port "$OLD_PROXY_PORT" &
OLD_PROXY_PID=$!
sleep 5

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h 127.0.0.1 \
  -p "$OLD_PROXY_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  --no-owner \
  --no-acl \
  -f "$DUMP_FILE"

kill "$OLD_PROXY_PID" 2>/dev/null || true
wait "$OLD_PROXY_PID" 2>/dev/null || true
OLD_PROXY_PID=""

echo "Dump saved: ${DUMP_FILE}"

echo ""
echo "[2/5] 東京インスタンス (${NEW_INSTANCE}) を作成..."
GOOGLE_CLOUD_LOCATION="$NEW_REGION" \
CLOUD_SQL_INSTANCE_NAME="$NEW_INSTANCE" \
CLOUD_SQL_DB_PASSWORD="$DB_PASSWORD" \
  bash "$ROOT/infra/cloud-sql/setup.sh"

# shellcheck disable=SC1090
source "$CREDS_FILE"

echo ""
echo "[3/5] 東京 DB へリストア..."
"$PROXY_BIN" "$CONNECTION_NAME" --port "$NEW_PROXY_PORT" &
NEW_PROXY_PID=$!
sleep 5

PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h 127.0.0.1 \
  -p "$NEW_PROXY_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  "$DUMP_FILE" || true

kill "$NEW_PROXY_PID" 2>/dev/null || true
wait "$NEW_PROXY_PID" 2>/dev/null || true
NEW_PROXY_PID=""

echo ""
echo "[4/5] Drizzle マイグレーション..."
bash "$ROOT/infra/cloud-sql/migrate.sh"

echo ""
echo "[5/5] 完了"
echo ""
echo "=== 東京移行完了 ==="
echo ""
echo "接続先: ${CONNECTION_NAME}"
echo ""
echo "Next steps:"
echo "  1. GOOGLE_CLOUD_LOCATION=asia-northeast1 pnpm --filter @tabipla/backend-api run deploy"
echo "  2. GOOGLE_CLOUD_LOCATION=asia-northeast1 pnpm --filter @tabipla/agent run deploy"
echo "  3. cd apps/user-web && pnpm run deploy"
echo "  4. 動作確認後、旧インスタンス削除:"
echo "     gcloud sql instances delete ${OLD_INSTANCE} --project=${PROJECT}"
echo ""
echo "旧 Cloud Run (us-central1) も削除または未使用にしてください。"
