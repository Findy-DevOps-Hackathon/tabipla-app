#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CLOUDBUILD_P4SA="service-${PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Project:        ${PROJECT}"
echo "Cloud Build SA: ${CLOUDBUILD_SA}"
echo "Cloud Run SA:   ${RUN_SA}"
echo ""

APIS=(
  cloudbuild.googleapis.com
  run.googleapis.com
  secretmanager.googleapis.com
  artifactregistry.googleapis.com
  containerregistry.googleapis.com
  aiplatform.googleapis.com
)

for api in "${APIS[@]}"; do
  echo "Enabling ${api}..."
  gcloud services enable "$api" --project="$PROJECT" --quiet
done

echo ""
echo "Granting Cloud Build SA permissions for Cloud Run deploy..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" \
  --quiet >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --project="$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null

echo "Granting Secret Manager access..."
SECRETS=(
  tabipla-database-url
  tabipla-admin-jwt-secret
  tabipla-gemini-api-key
  tabipla-google-maps-api-key
  tabipla-es-api-key
  tabipla-es-password
)

for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --project="$PROJECT" >/dev/null 2>&1; then
    for sa in "$CLOUDBUILD_SA" "$RUN_SA"; do
      gcloud secrets add-iam-policy-binding "$secret" \
        --project="$PROJECT" \
        --member="serviceAccount:${sa}" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet >/dev/null 2>&1 || true
    done
    echo "  ✓ ${secret}"
  fi
done

echo ""
echo "Granting Vertex AI User to Cloud Run SA (agent / backend-api 用)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/aiplatform.user" \
  --quiet >/dev/null 2>&1 || true

echo "Granting Secret Manager admin to Cloud Build P4SA (GitHub 連携用)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_P4SA}" \
  --role="roles/secretmanager.admin" \
  --quiet >/dev/null 2>&1 || true

echo ""
echo "=== IAM setup complete ==="
