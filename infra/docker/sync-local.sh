#!/usr/bin/env bash
set -euo pipefail

# ローカル PostgreSQL をマイグレーション・seed・reindex で最新化する。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

sync_db() {
  local port="$1"
  local label="$2"
  local url="postgresql://tabipla:tabipla@localhost:${port}/tabipla"

  echo ""
  echo "=== ${label} (localhost:${port}) ==="

  if ! (echo >/dev/tcp/localhost/"${port}") 2>/dev/null; then
    echo "スキップ: localhost:${port} に接続できません。"
    return 0
  fi

  DATABASE_URL="$url" pnpm -C "$ROOT/packages/db" db:migrate
  DATABASE_URL="$url" pnpm -C "$ROOT/packages/db" seed
  DATABASE_URL="$url" pnpm -C "$ROOT/packages/db" exec tsx scratch/delete-legacy-noto-spots.ts
  DATABASE_URL="$url" pnpm -C "$ROOT/packages/db" exec tsx scratch/prune-non-seed-spots.ts
}

sync_db 5433 "Docker PostgreSQL"

echo ""
echo "=== Elasticsearch（index 再作成 + reindex + embedding）==="
if ! curl -sf http://localhost:9200 >/dev/null; then
  echo "Elasticsearch が起動していません。先に以下を実行してください:"
  echo "  pnpm docker:up"
  exit 1
fi

curl -s -X DELETE "http://localhost:9200/spots" >/dev/null 2>&1 || true
pnpm --filter @tabipla/db... build
pnpm -C "$ROOT/services/backend-api" reindex
pnpm -C "$ROOT/services/backend-api" embed-spots

echo ""
echo "=== 動作確認 ==="
echo "  curl http://localhost:3001/health"
echo "  curl -G 'http://localhost:3001/search' --data-urlencode 'q=能登' --data-urlencode 'size=5'"
echo ""
echo "Local sync complete."
