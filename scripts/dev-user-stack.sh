#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> PostgreSQL を起動します（Docker）"
pnpm docker:up

echo "==> backend-api (3001) / agent (8080) / user-web (5173) を起動します"
echo "    AIガイド: http://localhost:5173 （スポット詳細 → チャット）"
echo "    停止: Ctrl+C"
echo ""

cleanup() {
  trap - EXIT INT TERM
  for pid in $(jobs -p); do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

pnpm -C services/backend-api dev &
pnpm -C services/agent dev &
pnpm -C apps/user-web dev &

wait
