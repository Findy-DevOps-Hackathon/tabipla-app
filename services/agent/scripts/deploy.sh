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
ES_CREDS_FILE="$ROOT/infra/elasticsearch/.credentials"

if [[ -f "$ES_CREDS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ES_CREDS_FILE"
  set +a
fi

if [[ -z "${BACKEND_API_URL:-}" ]] || [[ "${BACKEND_API_URL:-}" == *localhost* ]]; then
  BACKEND_API_URL="$(gcloud run services describe tabipla-backend-api \
    --project="$PROJECT" \
    --region="$REGION" \
    --format='value(status.url)' 2>/dev/null || true)"
fi

IMAGE="gcr.io/${PROJECT}/${SERVICE}"

echo "Building ${IMAGE} with Cloud Build (${REGION})..."
gcloud builds submit "$ROOT" \
  --project="$PROJECT" \
  --region="$REGION" \
  --default-buckets-behavior=regional-user-owned-bucket \
  --config=services/agent/cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE}"

ENV_VARS_FILE="$(mktemp)"
trap 'rm -f "$ENV_VARS_FILE"' EXIT
{
  echo "GOOGLE_GENAI_USE_VERTEXAI: \"TRUE\""
  echo "GOOGLE_CLOUD_PROJECT: \"${PROJECT}\""
  echo "GOOGLE_CLOUD_LOCATION: \"${REGION}\""
  [[ -n "${BACKEND_API_URL:-}" ]] && echo "BACKEND_API_URL: \"${BACKEND_API_URL}\""
  [[ -n "${ES_NODE:-}" ]] && echo "ES_NODE: \"${ES_NODE}\""
  [[ -n "${ES_INDEX:-}" ]] && echo "ES_INDEX: \"${ES_INDEX}\""
  [[ -n "${ES_VECTOR_DIMS:-}" ]] && echo "ES_VECTOR_DIMS: \"${ES_VECTOR_DIMS}\""
} >"$ENV_VARS_FILE"

SECRETS=()
for pair in \
  "ADMIN_JWT_SECRET=tabipla-admin-jwt-secret" \
  "AGENT_INTERNAL_SECRET=tabipla-agent-internal-secret" \
  "GEMINI_API_KEY=tabipla-gemini-api-key" \
  "ES_API_KEY=tabipla-es-api-key" \
  "ES_PASSWORD=tabipla-es-password" \
  "ES_USERNAME=tabipla-es-username"; do
  env_name="${pair%%=*}"
  secret_name="${pair##*=}"
  if gcloud secrets describe "$secret_name" --project="$PROJECT" >/dev/null 2>&1; then
    SECRETS+=("${env_name}=${secret_name}:latest")
  fi
done

DEPLOY_ARGS=(
  --project="$PROJECT"
  --region="$REGION"
  --image="${IMAGE}"
  --allow-unauthenticated
  --port=8080
  --memory=1Gi
  --cpu=1
  --timeout=300
  --min-instances=0
  --max-instances=5
  --env-vars-file="$ENV_VARS_FILE"
)
if [[ ${#SECRETS[@]} -gt 0 ]]; then
  IFS=','; DEPLOY_ARGS+=(--set-secrets="${SECRETS[*]}"); unset IFS
fi

echo "Deploying ${SERVICE} to Cloud Run (project=${PROJECT}, region=${REGION})"
gcloud run deploy "$SERVICE" "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: ${URL}"
echo "Health check: ${URL}/healthz"
echo ""
echo "backend-api から使う場合は AGENT_API_URL=${URL} を設定してください。"
