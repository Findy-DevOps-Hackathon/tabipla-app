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

sync_db 5432 "Homebrew PostgreSQL"
sync_db 5433 "Docker PostgreSQL"

echo ""
echo "=== Elasticsearch reindex (backend-api .env の DB) ==="
pnpm -C "$ROOT/packages/db" build
pnpm -C "$ROOT/services/backend-api" reindex

echo ""
echo "Local sync complete."
