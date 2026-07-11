#!/usr/bin/env bash
# GCP Cloud Monitoring: Cloud Run + Cloud SQL のアラートを Discord に通知する。
#
# 使い方:
#   export GOOGLE_CLOUD_PROJECT=tabipla-user-web
#   export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
#   bash infra/monitoring/setup-gcp.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
PUBSUB_TOPIC="${TABIPLA_ALERT_TOPIC:-tabipla-monitoring-alerts}"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
  echo "DISCORD_WEBHOOK_URL を設定してください" >&2
  exit 1
fi

if [[ "$DISCORD_WEBHOOK_URL" != *"/api/webhooks/"* ]]; then
  echo "DISCORD_WEBHOOK_URL の形式が不正です" >&2
  exit 1
fi

echo "=== tabipla GCP Monitoring セットアップ ==="
echo "Project: ${PROJECT}"
echo "Region:  ${REGION}"
echo ""

gcloud services enable \
  monitoring.googleapis.com \
  pubsub.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  eventarc.googleapis.com \
  serviceusage.googleapis.com \
  --project="$PROJECT"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

if ! gcloud pubsub topics describe "$PUBSUB_TOPIC" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud pubsub topics create "$PUBSUB_TOPIC" --project="$PROJECT"
  echo "Created: Pub/Sub topic ${PUBSUB_TOPIC}"
else
  echo "Exists: Pub/Sub topic ${PUBSUB_TOPIC}"
fi

monitoring_sa="service-${PROJECT_NUMBER}@gcp-sa-monitoring-notification.iam.gserviceaccount.com"
echo "Setting Pub/Sub IAM for Monitoring notification..."
gcloud pubsub topics add-iam-policy-binding "$PUBSUB_TOPIC" \
  --project="$PROJECT" \
  --member="serviceAccount:${monitoring_sa}" \
  --role="roles/pubsub.publisher" \
  --quiet 2>/dev/null || true
echo "Done: Pub/Sub IAM"

export GOOGLE_CLOUD_PROJECT="$PROJECT"
export TABIPLA_ALERT_TOPIC="$PUBSUB_TOPIC"
export TABIPLA_CLOUD_SQL_INSTANCE="${TABIPLA_CLOUD_SQL_INSTANCE:-tabipla-db-tokyo}"
python3 "${ROOT}/infra/monitoring/setup_alerts.py"

echo ""
echo "Preparing Pub/Sub / Eventarc service identities for Cloud Function..."
# gcloud の出力に venv セットアップログが混ざるため、SA メールは project number から組み立てる
PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
echo "Pub/Sub service account: ${PUBSUB_SA}"

gcloud beta services identity create \
  --service=pubsub.googleapis.com \
  --project="$PROJECT" \
  >/dev/null 2>&1 || true

gcloud beta services identity create \
  --service=eventarc.googleapis.com \
  --project="$PROJECT" \
  >/dev/null 2>&1 || true

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${PUBSUB_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --quiet >/dev/null
echo "Done: service identities"

echo ""
echo "Deploying Cloud Function tabipla-discord-notifier (通常 3〜10 分かかります)..."
gcloud functions deploy tabipla-discord-notifier \
  --project="$PROJECT" \
  --gen2 \
  --region="$REGION" \
  --runtime=python312 \
  --source="${ROOT}/infra/monitoring/discord-notifier" \
  --entry-point=notify_discord \
  --trigger-topic="$PUBSUB_TOPIC" \
  --set-env-vars="DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}" \
  --quiet

echo ""
echo "=== 完了 ==="
echo "Alert policies: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT}"
echo "通知: Monitoring → Pub/Sub → Cloud Function → Discord"
