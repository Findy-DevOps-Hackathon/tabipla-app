#!/usr/bin/env bash
set -euo pipefail

# admin-web は Firebase プロジェクト tabipla-admin-web、API は tabipla-user-web にあるため
# Cloud Run URL を VITE_API_BASE に埋め込んでビルドする（/api rewrite は使えない）。
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/apps/admin-web"

BACKEND_PROJECT="${TABIPLA_BACKEND_PROJECT:-tabipla-user-web}"
REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"

if [[ -z "${VITE_API_BASE:-}" ]]; then
  VITE_API_BASE="$(gcloud run services describe tabipla-backend-api \
    --project="$BACKEND_PROJECT" \
    --region="$REGION" \
    --format='value(status.url)' 2>/dev/null || true)"
fi

if [[ -z "${VITE_API_BASE:-}" ]]; then
  echo "VITE_API_BASE が取得できません。" >&2
  exit 1
fi

echo "Building admin-web"
echo "  VITE_API_BASE=${VITE_API_BASE}"
VITE_API_BASE="$VITE_API_BASE" pnpm build
pnpm exec firebase deploy --only hosting
