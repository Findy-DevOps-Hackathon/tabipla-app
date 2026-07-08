#!/usr/bin/env bash
# /workspace/.pnpm-store を GCS へ保存する。
# キャッシュキー: pnpm-lock.yaml の SHA256 先頭16文字
# 既に同じキーのキャッシュが存在する場合はスキップする（毎回上書きしない）。
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

STORE_DIR="/workspace/.pnpm-store"
if [[ ! -d "${STORE_DIR}" ]]; then
  echo "pnpm store が見つかりません。スキップします。"
  exit 0
fi

CACHE_BUCKET="gs://${PROJECT_ID}_cloudbuild/pnpm-cache"
LOCKFILE="/workspace/pnpm-lock.yaml"
CACHE_KEY="$(sha256sum "${LOCKFILE}" | cut -c1-16)"
CACHE_FILE="${CACHE_BUCKET}/${CACHE_KEY}.tar.gz"

echo "Cache key  : ${CACHE_KEY}"
echo "Cache file : ${CACHE_FILE}"

if gsutil -q stat "${CACHE_FILE}" 2>/dev/null; then
  echo "Cache already exists — skip upload."
  exit 0
fi

echo "Saving cache..."
tar -czf /tmp/pnpm-cache.tar.gz -C /workspace .pnpm-store
gsutil cp /tmp/pnpm-cache.tar.gz "${CACHE_FILE}"
echo "Cache saved: ${CACHE_FILE}"
