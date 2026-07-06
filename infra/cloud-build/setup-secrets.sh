#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

ENV_FILE="$ROOT/services/backend-api/.env"
SQL_CREDS="$ROOT/infra/cloud-sql/.credentials"
GCS_CREDS="$ROOT/infra/gcs/.credentials"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
if [[ -f "$SQL_CREDS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SQL_CREDS"
  set +a
  if [[ -n "${DATABASE_URL_CLOUD_RUN:-}" ]]; then
    DATABASE_URL="$DATABASE_URL_CLOUD_RUN"
  fi
fi
if [[ -f "$GCS_CREDS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$GCS_CREDS"
  set +a
fi

upsert_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "  - ${name}: skip (値なし)"
    return 0
  fi
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" \
      --project="$PROJECT" \
      --data-file=- \
      --quiet >/dev/null
    echo "  ✓ ${name}: updated"
  else
    printf '%s' "$value" | gcloud secrets create "$name" \
      --project="$PROJECT" \
      --replication-policy=automatic \
      --data-file=- \
      --quiet >/dev/null
    echo "  ✓ ${name}: created"
  fi
}

echo "Project: ${PROJECT}"
echo ""
echo "Creating/updating secrets from local files..."
echo "  sources: .env, infra/cloud-sql/.credentials, infra/gcs/.credentials"
echo ""

gcloud services enable secretmanager.googleapis.com --project="$PROJECT" --quiet

upsert_secret tabipla-database-url "${DATABASE_URL:-}"
upsert_secret tabipla-admin-jwt-secret "${ADMIN_JWT_SECRET:-}"
upsert_secret tabipla-user-jwt-secret "${USER_JWT_SECRET:-}"
upsert_secret tabipla-gemini-api-key "${GEMINI_API_KEY:-}"
upsert_secret tabipla-google-maps-api-key "${GOOGLE_MAPS_API_KEY:-}"
upsert_secret tabipla-es-api-key "${ES_API_KEY:-}"
upsert_secret tabipla-es-password "${ES_PASSWORD:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo ""
  echo "WARNING: DATABASE_URL が未設定です。" >&2
  echo "  bash infra/cloud-sql/setup.sh を実行するか、.env に DATABASE_URL を設定してください。" >&2
  exit 1
fi

if [[ "${ADMIN_JWT_SECRET:-}" == "tabipla-dev-admin-secret" ]] || [[ -z "${ADMIN_JWT_SECRET:-}" ]]; then
  echo ""
  echo "WARNING: ADMIN_JWT_SECRET が開発用のままです。本番では必ず変更してください。" >&2
fi

echo ""
echo "=== Secrets setup complete ==="
echo ""
echo "Next: bash infra/cloud-build/setup-iam.sh"
