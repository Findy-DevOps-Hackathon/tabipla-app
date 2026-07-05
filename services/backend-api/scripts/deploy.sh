#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-tabipla-backend-api}"
IMAGE="gcr.io/${PROJECT}/${SERVICE}"
ENV_FILE="$ROOT/services/backend-api/.env"
CREDS_FILE="$ROOT/infra/cloud-sql/.credentials"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -f "$CREDS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  set +a
  # 本番デプロイでは Cloud SQL 接続を優先（.env の localhost Docker 用 URL を上書き）
  if [[ -n "${DATABASE_URL_CLOUD_RUN:-}" ]]; then
    DATABASE_URL="$DATABASE_URL_CLOUD_RUN"
  fi
fi

if [[ -z "${CORS_ORIGINS:-}" ]]; then
  CORS_ORIGINS="https://tabipla-admin-web.web.app,https://tabipla-admin-web.firebaseapp.com,https://tabipla-user-web.web.app,https://tabipla-user-web.firebaseapp.com"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL が未設定です。環境変数または services/backend-api/.env に設定してください。" >&2
  exit 1
fi

if [[ -z "${AGENT_API_URL:-}" ]]; then
  AGENT_API_URL="$(gcloud run services describe tabipla-agent \
    --project="$PROJECT" \
    --region="$REGION" \
    --format='value(status.url)' 2>/dev/null || true)"
fi

ENV_VARS_FILE="$(mktemp)"
trap 'rm -f "$ENV_VARS_FILE"' EXIT

{
  echo "DATABASE_URL: \"${DATABASE_URL}\""
  [[ -n "${AGENT_API_URL:-}" ]] && echo "AGENT_API_URL: \"${AGENT_API_URL}\""
  [[ -n "${ES_NODE:-}" ]] && echo "ES_NODE: \"${ES_NODE}\""
  [[ -n "${ES_API_KEY:-}" ]] && echo "ES_API_KEY: \"${ES_API_KEY}\""
  [[ -n "${ES_USERNAME:-}" ]] && echo "ES_USERNAME: \"${ES_USERNAME}\""
  [[ -n "${ES_PASSWORD:-}" ]] && echo "ES_PASSWORD: \"${ES_PASSWORD}\""
  [[ -n "${ES_INDEX:-}" ]] && echo "ES_INDEX: \"${ES_INDEX}\""
  [[ -n "${ES_VECTOR_DIMS:-}" ]] && echo "ES_VECTOR_DIMS: \"${ES_VECTOR_DIMS}\""
  [[ -n "${GEMINI_API_KEY:-}" ]] && echo "GEMINI_API_KEY: \"${GEMINI_API_KEY}\""
  [[ -n "${EMBEDDING_PROVIDER:-}" ]] && echo "EMBEDDING_PROVIDER: \"${EMBEDDING_PROVIDER}\""
  [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]] && echo "GOOGLE_MAPS_API_KEY: \"${GOOGLE_MAPS_API_KEY}\""
  [[ -n "${ADMIN_JWT_SECRET:-}" ]] && echo "ADMIN_JWT_SECRET: \"${ADMIN_JWT_SECRET}\""
  [[ -n "${USER_JWT_SECRET:-}" ]] && echo "USER_JWT_SECRET: \"${USER_JWT_SECRET}\""
  [[ -n "${CORS_ORIGINS:-}" ]] && echo "CORS_ORIGINS: \"${CORS_ORIGINS}\""
} >"$ENV_VARS_FILE"

echo "Building ${IMAGE} with Cloud Build..."
gcloud builds submit "$ROOT" \
  --project="$PROJECT" \
  --config=services/backend-api/cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE}"

DEPLOY_ARGS=(
  --project="$PROJECT"
  --region="$REGION"
  --image="${IMAGE}"
  --allow-unauthenticated
  --port=8080
  --memory=512Mi
  --cpu=1
  --timeout=300
  --min-instances=0
  --max-instances=5
  --env-vars-file="$ENV_VARS_FILE"
)

if [[ -n "${CLOUD_SQL_INSTANCE:-}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances="$CLOUD_SQL_INSTANCE")
fi

echo "Deploying ${SERVICE} to Cloud Run (project=${PROJECT}, region=${REGION})"
gcloud run deploy "$SERVICE" "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: ${URL}"
echo "Health check: ${URL}/health"
echo ""
echo "user-web から使う場合は firebase.json の /api/** rewrite または src/api.ts の API_BASE 切り替えが必要です。"
