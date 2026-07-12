#!/usr/bin/env bash
set -euo pipefail

# infra/gcs/.credentials の GCS 設定を Cloud Run (backend-api) へ即時反映する。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/gcs/.credentials"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "先に bash infra/gcs/setup.sh を実行してください" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$CREDS_FILE"
set +a

if [[ -z "${GCS_BUCKET:-}" ]]; then
  echo "GCS_BUCKET が未設定です。" >&2
  exit 1
fi

if [[ "${GCS_BUCKET}" == *'PROJECT_ID'* || "${GCS_BUCKET}" == *'${'* ]]; then
  echo "GCS_BUCKET に未展開のプレースホルダが含まれています: ${GCS_BUCKET}" >&2
  echo "infra/gcs/setup.sh を再実行して正しいバケット名を設定してください。" >&2
  exit 1
fi

GCS_PUBLIC_BASE_URL="${GCS_PUBLIC_BASE_URL:-https://storage.googleapis.com/${GCS_BUCKET}}"
GCS_OBJECT_PREFIX="${GCS_OBJECT_PREFIX:-spots}"

backend_env="GCS_BUCKET=${GCS_BUCKET},GCS_PUBLIC_BASE_URL=${GCS_PUBLIC_BASE_URL},GCS_OBJECT_PREFIX=${GCS_OBJECT_PREFIX}"

echo "Updating tabipla-backend-api GCS env..."
echo "  GCS_BUCKET=${GCS_BUCKET}"
echo "  GCS_PUBLIC_BASE_URL=${GCS_PUBLIC_BASE_URL}"
echo "  GCS_OBJECT_PREFIX=${GCS_OBJECT_PREFIX}"

gcloud run services update tabipla-backend-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-env-vars="$backend_env"

BACKEND_URL="$(gcloud run services describe tabipla-backend-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null || true)"

echo ""
echo "=== Cloud Run GCS env updated ==="
[[ -n "$BACKEND_URL" ]] && echo "backend health: ${BACKEND_URL}/health"
