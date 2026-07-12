#!/usr/bin/env bash
# Cloud Build から agent を Gemini Enterprise Agent Platform Runtime にデプロイ
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID が未設定です。" >&2
  exit 1
fi

REGION="${_REGION:-asia-northeast1}"
REPOSITORY="${AGENT_PLATFORM_REPOSITORY:-tabipla-agents}"
IMAGE_NAME="${AGENT_PLATFORM_IMAGE:-tabipla-agent}"
IMAGE_TAG="${AGENT_PLATFORM_IMAGE_TAG:-latest}"
DISPLAY_NAME="${AGENT_PLATFORM_DISPLAY_NAME:-tabipla-agent}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

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

if ! gcloud artifacts repositories describe "$REPOSITORY" \
  --project="${PROJECT_ID}" \
  --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" \
    --project="${PROJECT_ID}" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Gemini Enterprise Agent Platform images for tabipla"
fi

echo "Building and pushing ${IMAGE_URI}..."
gcloud builds submit "$ROOT" \
  --project="${PROJECT_ID}" \
  --region="$REGION" \
  --default-buckets-behavior=regional-user-owned-bucket \
  --config=services/agent/cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE_URI}"

ENV_VARS=(
  "GOOGLE_GENAI_USE_VERTEXAI=TRUE"
  "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
  "GOOGLE_CLOUD_LOCATION=${REGION}"
)
[[ -n "$BACKEND_URL" ]] && ENV_VARS+=("BACKEND_API_URL=${BACKEND_URL}")
[[ -n "${_ES_NODE:-}" ]] && ENV_VARS+=("ES_NODE=${_ES_NODE}")
[[ -n "${_ES_INDEX:-}" ]] && ENV_VARS+=("ES_INDEX=${_ES_INDEX}")
[[ -n "${_ES_VECTOR_DIMS:-}" ]] && ENV_VARS+=("ES_VECTOR_DIMS=${_ES_VECTOR_DIMS}")

SECRET_ENV_VARS=()

IFS=','; ENV_VARS_CSV="${ENV_VARS[*]}"; SECRET_ENV_VARS_CSV="${SECRET_ENV_VARS[*]}"; unset IFS

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
for sa in \
  "service-${PROJECT_NUMBER}@gcp-sa-aiplatform.iam.gserviceaccount.com" \
  "service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${sa}" \
    --role="roles/artifactregistry.reader" \
    --quiet >/dev/null 2>&1 || true
done

if ! python3 -c "import vertexai" >/dev/null 2>&1; then
  python3 -m pip install --quiet 'google-cloud-aiplatform[agent_engines]>=1.144'
fi

RESOURCE_JSON="$(python3 services/agent/scripts/deploy-agent-platform.py \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --display-name "$DISPLAY_NAME" \
  --image-uri "$IMAGE_URI" \
  --env-vars "$ENV_VARS_CSV" \
  --secret-env-vars "${SECRET_ENV_VARS_CSV:-}")"
RESOURCE_NAME="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['resource_name'])" "$RESOURCE_JSON")"

CREDS_DIR="$ROOT/infra/agent-platform"
mkdir -p "$CREDS_DIR"
cat >"$CREDS_DIR/.credentials" <<EOF
AGENT_PLATFORM_RESOURCE=${RESOURCE_NAME}
AGENT_PLATFORM_LOCATION=${REGION}
EOF

echo "Deployed to Gemini Enterprise Agent Platform Runtime"
echo "  AGENT_PLATFORM_RESOURCE=${RESOURCE_NAME}"
echo "  AGENT_PLATFORM_LOCATION=${REGION}"
