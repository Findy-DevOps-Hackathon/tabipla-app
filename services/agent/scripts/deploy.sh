#!/usr/bin/env bash
set -euo pipefail

# リポジトリルートへ移動（services/agent/scripts から実行想定）
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-tabipla-agent}"
USE_MOCK="${USE_MOCK:-1}"
IMAGE="gcr.io/${PROJECT}/${SERVICE}"

echo "Building ${IMAGE} with Cloud Build (${REGION})..."
gcloud builds submit "$ROOT" \
  --project="$PROJECT" \
  --region="$REGION" \
  --config=services/agent/cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE}"

echo "Deploying ${SERVICE} to Cloud Run (project=${PROJECT}, region=${REGION})"
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --image="${IMAGE}" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --min-instances=0 \
  --max-instances=5 \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},USE_MOCK=${USE_MOCK}"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: ${URL}"
echo "Health check: ${URL}/healthz"
echo ""
echo "backend-api から使う場合は AGENT_API_URL=${URL} を設定してください。"
