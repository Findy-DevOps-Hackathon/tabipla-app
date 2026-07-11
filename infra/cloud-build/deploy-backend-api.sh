#!/usr/bin/env bash
# Cloud Build から backend-api を Cloud Run にデプロイ（Secret Manager 連携）
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

REGION="${_REGION:-asia-northeast1}"
SERVICE="${_SERVICE:-tabipla-backend-api}"
IMAGE="${_IMAGE:-gcr.io/${PROJECT_ID}/tabipla-backend-api}"
CLOUD_SQL_INSTANCE="${_CLOUD_SQL_INSTANCE:-}"
if [[ -z "$CLOUD_SQL_INSTANCE" || "$CLOUD_SQL_INSTANCE" == *'PROJECT_ID'* ]]; then
  CLOUD_SQL_INSTANCE="${PROJECT_ID}:asia-northeast1:tabipla-db"
fi
CORS_ORIGINS="${_CORS_ORIGINS:-https://tabipla-admin-web.web.app,https://tabipla-admin-web.firebaseapp.com,https://tabipla-user-web.web.app,https://tabipla-user-web.firebaseapp.com}"

AGENT_URL=""
if gcloud run services describe tabipla-agent \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)' >/dev/null 2>&1; then
  AGENT_URL="$(gcloud run services describe tabipla-agent \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(status.url)')"
fi
if [[ -z "$AGENT_URL" ]]; then
  echo "WARNING: tabipla-agent が未デプロイです。AGENT_API_URL は設定されません。" >&2
fi

SECRETS=()
require_secret() {
  local env_name="$1"
  local secret_name="$2"
  if ! gcloud secrets describe "$secret_name" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "ERROR: Secret '${secret_name}' (${env_name}) が存在しません。" >&2
    echo "  bash infra/cloud-build/setup-secrets.sh を実行してください。" >&2
    exit 1
  fi
  SECRETS+=("${env_name}=${secret_name}:latest")
}

require_secret DATABASE_URL tabipla-database-url
require_secret ADMIN_JWT_SECRET tabipla-admin-jwt-secret
require_secret AGENT_INTERNAL_SECRET tabipla-agent-internal-secret

for pair in \
  "GOOGLE_MAPS_API_KEY=tabipla-google-maps-api-key" \
  "ES_API_KEY=tabipla-es-api-key" \
  "ES_PASSWORD=tabipla-es-password" \
  "ES_USERNAME=tabipla-es-username"; do
  env_name="${pair%%=*}"
  secret_name="${pair##*=}"
  if gcloud secrets describe "$secret_name" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    SECRETS+=("${env_name}=${secret_name}:latest")
  fi
done

IFS=','; SECRETS_CSV="${SECRETS[*]}"; unset IFS

ENV_VARS_FILE="$(mktemp)"
trap 'rm -f "$ENV_VARS_FILE"' EXIT
{
  echo "GOOGLE_CLOUD_PROJECT: \"${PROJECT_ID}\""
  echo "VERTEX_EMBEDDING_LOCATION: \"${_VERTEX_EMBEDDING_LOCATION:-us-central1}\""
  echo "CORS_ORIGINS: \"${CORS_ORIGINS}\""
  [[ -n "$AGENT_URL" ]] && echo "AGENT_API_URL: \"${AGENT_URL}\""
  [[ -n "${_GCS_BUCKET:-}" ]] && echo "GCS_BUCKET: \"${_GCS_BUCKET}\""
  [[ -n "${_GCS_PUBLIC_BASE_URL:-}" ]] && echo "GCS_PUBLIC_BASE_URL: \"${_GCS_PUBLIC_BASE_URL}\""
  [[ -n "${_GCS_OBJECT_PREFIX:-}" ]] && echo "GCS_OBJECT_PREFIX: \"${_GCS_OBJECT_PREFIX}\""
  [[ -n "${_ES_NODE:-}" ]] && echo "ES_NODE: \"${_ES_NODE}\""
  [[ -n "${_ES_INDEX:-}" ]] && echo "ES_INDEX: \"${_ES_INDEX}\""
  [[ -n "${_ES_VECTOR_DIMS:-}" ]] && echo "ES_VECTOR_DIMS: \"${_ES_VECTOR_DIMS}\""
  [[ -n "${_EMBEDDING_PROVIDER:-}" ]] && echo "EMBEDDING_PROVIDER: \"${_EMBEDDING_PROVIDER}\""
} >"$ENV_VARS_FILE"

DEPLOY_ARGS=(
  run deploy "${SERVICE}"
  --project="${PROJECT_ID}"
  --region="${REGION}"
  --image="${IMAGE}"
  --allow-unauthenticated
  --port=8080
  --memory=512Mi
  --cpu=1
  --timeout=300
  --min-instances=0
  --max-instances=5
  --env-vars-file="$ENV_VARS_FILE"
  --set-secrets="${SECRETS_CSV}"
)

if [[ -n "${CLOUD_SQL_INSTANCE}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances="${CLOUD_SQL_INSTANCE}")
fi

gcloud "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"
echo "Deployed: ${URL}"
echo "Health check: ${URL}/health"
