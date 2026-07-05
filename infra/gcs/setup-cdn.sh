#!/usr/bin/env bash
set -euo pipefail

# GCS バケットの前段に Cloud CDN + HTTP(S) Load Balancer を構築する（任意）。
# 完了後 GCS_PUBLIC_BASE_URL を LB の IP / カスタムドメインに差し替える。
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CREDS_FILE="$ROOT/infra/gcs/.credentials"

if [[ -f "$CREDS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  set +a
fi

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

BUCKET="${GCS_BUCKET:-}"
if [[ -z "$BUCKET" ]]; then
  echo "GCS_BUCKET が未設定です。先に bash infra/gcs/setup.sh を実行してください。" >&2
  exit 1
fi

BACKEND_BUCKET="${CDN_BACKEND_BUCKET:-tabipla-spot-images-backend}"
URL_MAP="${CDN_URL_MAP:-tabipla-spot-images-map}"
HTTP_PROXY="${CDN_HTTP_PROXY:-tabipla-spot-images-http-proxy}"
FORWARDING_RULE="${CDN_FORWARDING_RULE:-tabipla-spot-images-http-rule}"
ADDRESS_NAME="${CDN_ADDRESS_NAME:-tabipla-spot-images-ip}"

echo "Project:        ${PROJECT}"
echo "GCS bucket:     ${BUCKET}"
echo "Backend bucket: ${BACKEND_BUCKET}"
echo ""

echo "Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com --project="$PROJECT" --quiet

if ! gcloud compute backend-buckets describe "$BACKEND_BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating backend bucket with Cloud CDN enabled..."
  gcloud compute backend-buckets create "$BACKEND_BUCKET" \
    --project="$PROJECT" \
    --gcs-bucket-name="$BUCKET" \
    --enable-cdn \
    --quiet
else
  echo "Backend bucket '${BACKEND_BUCKET}' already exists."
fi

if ! gcloud compute url-maps describe "$URL_MAP" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating URL map..."
  gcloud compute url-maps create "$URL_MAP" \
    --project="$PROJECT" \
    --default-backend-bucket="$BACKEND_BUCKET" \
    --quiet
else
  echo "URL map '${URL_MAP}' already exists."
fi

if ! gcloud compute target-http-proxies describe "$HTTP_PROXY" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating HTTP proxy..."
  gcloud compute target-http-proxies create "$HTTP_PROXY" \
    --project="$PROJECT" \
    --url-map="$URL_MAP" \
    --quiet
else
  echo "HTTP proxy '${HTTP_PROXY}' already exists."
fi

if ! gcloud compute addresses describe "$ADDRESS_NAME" --global --project="$PROJECT" >/dev/null 2>&1; then
  echo "Reserving global static IP..."
  gcloud compute addresses create "$ADDRESS_NAME" \
    --project="$PROJECT" \
    --global \
    --quiet
else
  echo "Static IP '${ADDRESS_NAME}' already exists."
fi

if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE" --global --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating global forwarding rule (HTTP:80)..."
  gcloud compute forwarding-rules create "$FORWARDING_RULE" \
    --project="$PROJECT" \
    --address="$ADDRESS_NAME" \
    --global \
    --target-http-proxy="$HTTP_PROXY" \
    --ports=80 \
    --quiet
else
  echo "Forwarding rule '${FORWARDING_RULE}' already exists."
fi

LB_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" --global --project="$PROJECT" --format='value(address)')"
CDN_BASE_URL="http://${LB_IP}"

{
  echo ""
  echo "# Cloud CDN (added by infra/gcs/setup-cdn.sh)"
  echo "CDN_BACKEND_BUCKET=${BACKEND_BUCKET}"
  echo "CDN_LOAD_BALANCER_IP=${LB_IP}"
  echo "GCS_PUBLIC_BASE_URL=${CDN_BASE_URL}"
} >>"$CREDS_FILE"

echo ""
echo "=== Cloud CDN setup complete ==="
echo ""
echo "Load Balancer IP: ${LB_IP}"
echo "CDN base URL:     ${CDN_BASE_URL}"
echo ""
echo "infra/gcs/.credentials に GCS_PUBLIC_BASE_URL を追記しました。"
echo "backend-api を再デプロイ後、新規アップロード画像は CDN URL になります。"
echo ""
echo "HTTPS / カスタムドメインは Google Managed Certificate の設定が別途必要です。"
