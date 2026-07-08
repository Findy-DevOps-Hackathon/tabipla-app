#!/usr/bin/env bash
# pnpm store キャッシュを GCS から /workspace/.pnpm-store へ復元する。
# キャッシュキー: pnpm-lock.yaml の SHA256 先頭16文字
# キャッシュ場所: gs://${PROJECT_ID}_cloudbuild/pnpm-cache/<key>.tar.gz
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

CACHE_BUCKET="gs://${PROJECT_ID}_cloudbuild/pnpm-cache"
LOCKFILE="/workspace/pnpm-lock.yaml"
CACHE_KEY="$(sha256sum "${LOCKFILE}" | cut -c1-16)"
CACHE_FILE="${CACHE_BUCKET}/${CACHE_KEY}.tar.gz"

echo "Cache key  : ${CACHE_KEY}"
echo "Cache file : ${CACHE_FILE}"

if gsutil -q stat "${CACHE_FILE}" 2>/dev/null; then
  echo "Cache HIT — restoring..."
  gsutil cp "${CACHE_FILE}" /tmp/pnpm-cache.tar.gz
  tar -xzf /tmp/pnpm-cache.tar.gz -C /workspace
  echo "Restored: /workspace/.pnpm-store"
else
  echo "Cache MISS — starting cold install."
fi
