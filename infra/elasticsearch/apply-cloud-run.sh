#!/usr/bin/env bash
set -euo pipefail

# infra/elasticsearch/.credentials の内容を Cloud Run (backend-api / agent) へ即時反映する。
# 注意: gcloud run services update では --set-secrets が既存 Secret を消すため --update-secrets を使う。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/elasticsearch/.credentials"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "先に bash infra/elasticsearch/setup.sh を実行してください" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$CREDS_FILE"
set +a

if [[ -z "${ES_NODE:-}" ]]; then
  echo "ES_NODE が未設定です。" >&2
  exit 1
fi

# macOS 標準 bash 3.2 には nameref (local -n) がないため、配列名を eval で更新する。
collect_optional_secrets() {
  local array_name="$1"
  shift
  for pair in "$@"; do
    local env_name="${pair%%=*}"
    local secret_name="${pair##*=}"
    if gcloud secrets describe "$secret_name" --project="$PROJECT" >/dev/null 2>&1; then
      eval "${array_name}+=(\"${env_name}=${secret_name}:latest\")"
    fi
  done
}

BACKEND_URL="$(gcloud run services describe tabipla-backend-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null || true)"
AGENT_URL="$(gcloud run services describe tabipla-agent \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)' 2>/dev/null || true)"

backend_env="ES_NODE=${ES_NODE}"
[[ -n "${ES_INDEX:-}" ]] && backend_env="${backend_env},ES_INDEX=${ES_INDEX}"
[[ -n "${ES_VECTOR_DIMS:-}" ]] && backend_env="${backend_env},ES_VECTOR_DIMS=${ES_VECTOR_DIMS}"
[[ -n "${EMBEDDING_PROVIDER:-}" ]] && backend_env="${backend_env},EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER}"

backend_secrets=(
  "DATABASE_URL=tabipla-database-url:latest"
  "ADMIN_JWT_SECRET=tabipla-admin-jwt-secret:latest"
)
collect_optional_secrets backend_secrets \
  "GEMINI_API_KEY=tabipla-gemini-api-key" \
  "GOOGLE_MAPS_API_KEY=tabipla-google-maps-api-key" \
  "ES_API_KEY=tabipla-es-api-key" \
  "ES_PASSWORD=tabipla-es-password" \
  "ES_USERNAME=tabipla-es-username"

echo "Updating tabipla-backend-api..."
IFS=','; backend_secrets_csv="${backend_secrets[*]}"; unset IFS
gcloud run services update tabipla-backend-api \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-env-vars="$backend_env" \
  --update-secrets="$backend_secrets_csv"

agent_env="GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION}"
agent_env="${agent_env},ES_NODE=${ES_NODE}"
[[ -n "${ES_INDEX:-}" ]] && agent_env="${agent_env},ES_INDEX=${ES_INDEX}"
[[ -n "${ES_VECTOR_DIMS:-}" ]] && agent_env="${agent_env},ES_VECTOR_DIMS=${ES_VECTOR_DIMS}"
[[ -n "$BACKEND_URL" ]] && agent_env="${agent_env},BACKEND_API_URL=${BACKEND_URL}"

agent_secrets=()
collect_optional_secrets agent_secrets \
  "ADMIN_JWT_SECRET=tabipla-admin-jwt-secret" \
  "ES_API_KEY=tabipla-es-api-key" \
  "ES_PASSWORD=tabipla-es-password" \
  "ES_USERNAME=tabipla-es-username"

echo "Updating tabipla-agent..."
agent_args=(
  run services update tabipla-agent
  --project="$PROJECT"
  --region="$REGION"
  --update-env-vars="$agent_env"
  --remove-env-vars=USE_MOCK
)
if [[ ${#agent_secrets[@]} -gt 0 ]]; then
  IFS=','; agent_args+=(--update-secrets="${agent_secrets[*]}"); unset IFS
fi
gcloud "${agent_args[@]}"

echo ""
echo "=== Cloud Run updated ==="
[[ -n "$BACKEND_URL" ]] && echo "backend health: ${BACKEND_URL}/health"
[[ -n "$AGENT_URL" ]] && echo "agent health:   ${AGENT_URL}/healthz"
