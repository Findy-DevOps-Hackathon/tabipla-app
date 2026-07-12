#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "==> ポート ${port} を使用中のプロセスを停止します (${pids})"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 0.5
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local max="${3:-60}"
  for _ in $(seq 1 "${max}"); do
    if curl -sf "${url}" >/dev/null 2>&1; then
      echo "==> ${label} 起動確認: ${url}"
      return 0
    fi
    sleep 0.5
  done
  echo "ERROR: ${label} が起動しませんでした (${url})" >&2
  return 1
}

echo "==> PostgreSQL を起動します（Docker）"
pnpm docker:up

# ローカル開発は Docker PostgreSQL（5433）に統一する。
export DATABASE_URL="postgresql://tabipla:tabipla@localhost:5433/tabipla"

echo "==> 既存の backend-api / agent を停止します"
free_port 3001
free_port 8080

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

wait_for_url "http://127.0.0.1:3001/healthz" "backend-api"
wait_for_url "http://127.0.0.1:8080/healthz" "agent"

pnpm -C apps/user-web dev &

wait
