#!/usr/bin/env bash
# admin-web: Cloud Run URL を埋め込んでビルド → Firebase Hosting（tabipla-admin-web）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_PROJECT="${TABIPLA_BACKEND_PROJECT:-tabipla-user-web}"
ADMIN_FIREBASE_PROJECT="${TABIPLA_ADMIN_FIREBASE_PROJECT:-tabipla-admin-web}"
REGION="${_REGION:-asia-northeast1}"

fetch_cloud_run_url() {
  local project="$1"
  local service="$2"
  local region="$3"
  local url=""

  if command -v gcloud >/dev/null 2>&1; then
    url="$(gcloud run services describe "$service" \
      --project="$project" \
      --region="$region" \
      --format='value(status.url)' 2>/dev/null || true)"
    if [[ -n "$url" ]]; then
      echo "$url"
      return 0
    fi
  fi

  local token
  token="$(curl -sf -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")"
  url="$(curl -sf -H "Authorization: Bearer ${token}" \
    "https://run.googleapis.com/v1/projects/${project}/locations/${region}/services/${service}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).status.url))")"
  echo "$url"
}

VITE_API_BASE="${VITE_API_BASE:-$(fetch_cloud_run_url "$BACKEND_PROJECT" tabipla-backend-api "$REGION")}"

if [[ -z "$VITE_API_BASE" ]]; then
  echo "ERROR: VITE_API_BASE が取得できません（${BACKEND_PROJECT} / tabipla-backend-api）。" >&2
  exit 1
fi

echo "=== Deploy admin-web → ${ADMIN_FIREBASE_PROJECT} ==="
echo "  VITE_API_BASE=${VITE_API_BASE}"

cd "$ROOT"
VITE_API_BASE="${VITE_API_BASE}" pnpm --filter @tabipla/admin-web... build
cd "$ROOT/apps/admin-web"
pnpm exec firebase deploy --only hosting --project "${ADMIN_FIREBASE_PROJECT}" --non-interactive

echo "Deployed: https://${ADMIN_FIREBASE_PROJECT}.web.app"
