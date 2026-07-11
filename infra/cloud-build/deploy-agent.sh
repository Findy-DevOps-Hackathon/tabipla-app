#!/usr/bin/env bash
# Cloud Build から agent を Cloud Run にデプロイ（ES / backend 連携）
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

REGION="${_REGION:-asia-northeast1}"
SERVICE="${_SERVICE:-tabipla-agent}"
IMAGE="${_IMAGE:-gcr.io/${PROJECT_ID}/tabipla-agent}"

BACKEND_URL=""
if gcloud run services describe tabipla-backend-api \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)' >/dev/null 2>&1; then
  BACKEND_URL="$(gcloud run services describe tabipla-backend-api \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(status.url)')"
fi
if [[ -z "$BACKEND_URL" ]]; then
  echo "WARNING: tabipla-backend-api が未デプロイです。BACKEND_API_URL は設定されません。" >&2
fi

SECRETS=()
optional_secret() {
  local env_name="$1"
  local secret_name="$2"
  if gcloud secrets describe "$secret_name" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    SECRETS+=("${env_name}=${secret_name}:latest")
  fi
}

optional_secret AGENT_INTERNAL_SECRET tabipla-agent-internal-secret
optional_secret ES_API_KEY tabipla-es-api-key
optional_secret ES_PASSWORD tabipla-es-password
optional_secret ES_USERNAME tabipla-es-username

IFS=','; SECRETS_CSV="${SECRETS[*]}"; unset IFS

ENV_VARS_FILE="$(mktemp)"
trap 'rm -f "$ENV_VARS_FILE"' EXIT
{
  echo "GOOGLE_GENAI_USE_VERTEXAI: \"TRUE\""
  echo "GOOGLE_CLOUD_PROJECT: \"${PROJECT_ID}\""
  echo "GOOGLE_CLOUD_LOCATION: \"${REGION}\""
  [[ -n "$BACKEND_URL" ]] && echo "BACKEND_API_URL: \"${BACKEND_URL}\""
  [[ -n "${_ES_NODE:-}" ]] && echo "ES_NODE: \"${_ES_NODE}\""
  [[ -n "${_ES_INDEX:-}" ]] && echo "ES_INDEX: \"${_ES_INDEX}\""
  [[ -n "${_ES_VECTOR_DIMS:-}" ]] && echo "ES_VECTOR_DIMS: \"${_ES_VECTOR_DIMS}\""
} >"$ENV_VARS_FILE"

DEPLOY_ARGS=(
  run deploy "${SERVICE}"
  --project="${PROJECT_ID}"
  --region="${REGION}"
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

if [[ -n "$SECRETS_CSV" ]]; then
  DEPLOY_ARGS+=(--set-secrets="${SECRETS_CSV}")
fi

gcloud "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"
echo "Deployed: ${URL}"
echo "Health check: ${URL}/healthz"
