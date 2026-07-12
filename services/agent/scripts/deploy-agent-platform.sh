#!/usr/bin/env bash
# tabipla-agent を Gemini Enterprise Agent Platform Runtime（BYOC）へデプロイ
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
REPOSITORY="${AGENT_PLATFORM_REPOSITORY:-tabipla-agents}"
IMAGE_NAME="${AGENT_PLATFORM_IMAGE:-tabipla-agent}"
IMAGE_TAG="${AGENT_PLATFORM_IMAGE_TAG:-latest}"
DISPLAY_NAME="${AGENT_PLATFORM_DISPLAY_NAME:-tabipla-agent}"
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

if ! gcloud artifacts repositories describe "$REPOSITORY" \
  --project="$PROJECT" \
  --location="$REGION" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repository: ${REPOSITORY}"
  gcloud artifacts repositories create "$REPOSITORY" \
    --project="$PROJECT" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Gemini Enterprise Agent Platform images for tabipla"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building ${IMAGE_URI} with Cloud Build (${REGION})..."
gcloud builds submit "$ROOT" \
  --project="$PROJECT" \
  --region="$REGION" \
  --default-buckets-behavior=regional-user-owned-bucket \
  --config=services/agent/cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE_URI}"

ENV_VARS=()
ENV_VARS+=("GOOGLE_GENAI_USE_VERTEXAI=TRUE")
ENV_VARS+=("GOOGLE_CLOUD_PROJECT=${PROJECT}")
ENV_VARS+=("GOOGLE_CLOUD_LOCATION=${REGION}")
[[ -n "${BACKEND_API_URL:-}" ]] && ENV_VARS+=("BACKEND_API_URL=${BACKEND_API_URL}")
[[ -n "${ES_NODE:-}" ]] && ENV_VARS+=("ES_NODE=${ES_NODE}")
[[ -n "${ES_INDEX:-}" ]] && ENV_VARS+=("ES_INDEX=${ES_INDEX}")
[[ -n "${ES_VECTOR_DIMS:-}" ]] && ENV_VARS+=("ES_VECTOR_DIMS=${ES_VECTOR_DIMS}")

SECRET_ENV_VARS=()

IFS=','; ENV_VARS_CSV="${ENV_VARS[*]}"; SECRET_ENV_VARS_CSV="${SECRET_ENV_VARS[*]}"; unset IFS

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
for sa in \
  "service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com" \
  "service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${sa}" \
    --role="roles/artifactregistry.reader" \
    --quiet >/dev/null 2>&1 || true
done

DEPLOY_ARGS=(
  --project "$PROJECT"
  --location "$REGION"
  --display-name "$DISPLAY_NAME"
  --image-uri "$IMAGE_URI"
  --env-vars "$ENV_VARS_CSV"
  --secret-env-vars "$SECRET_ENV_VARS_CSV"
)
if [[ -n "${AGENT_PLATFORM_RESOURCE_ID:-}" ]]; then
  DEPLOY_ARGS+=(--resource-id "${AGENT_PLATFORM_RESOURCE_ID}")
fi

echo "Deploying to Gemini Enterprise Agent Platform Runtime..."
if ! python3 -c "import google.cloud.aiplatform" >/dev/null 2>&1; then
  echo "Installing google-cloud-aiplatform[agent_engines] for deploy..."
  python3 -m pip install --user 'google-cloud-aiplatform[agent_engines]>=1.144'
fi

RESOURCE_JSON="$(python3 services/agent/scripts/deploy-agent-platform.py "${DEPLOY_ARGS[@]}")"
RESOURCE_NAME="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['resource_name'])" "$RESOURCE_JSON")"

echo ""
echo "Deployed to Gemini Enterprise Agent Platform Runtime"
echo "  AGENT_PLATFORM_RESOURCE=${RESOURCE_NAME}"
echo "  AGENT_PLATFORM_LOCATION=${REGION}"
echo ""
echo "backend-api から使う場合:"
echo "  AGENT_PLATFORM_RESOURCE=${RESOURCE_NAME}"
echo "  AGENT_PLATFORM_LOCATION=${REGION}"
echo ""
CREDS_DIR="$ROOT/infra/agent-platform"
mkdir -p "$CREDS_DIR"
cat >"$CREDS_DIR/.credentials" <<EOF
AGENT_PLATFORM_RESOURCE=${RESOURCE_NAME}
AGENT_PLATFORM_LOCATION=${REGION}
EOF
echo "Saved: ${CREDS_DIR}/.credentials"
