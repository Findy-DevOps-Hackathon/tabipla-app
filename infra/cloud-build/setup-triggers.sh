#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT または gcloud config set project を設定してください" >&2
  exit 1
fi

REGION="${GOOGLE_CLOUD_LOCATION:-asia-northeast1}"
CONNECTION="${CLOUD_BUILD_CONNECTION:-github-tabipla}"
REPO="${CLOUD_BUILD_REPOSITORY:-Findy-DevOps-Hackathon-tabipla-app}"
BRANCH="${CLOUD_BUILD_BRANCH:-^main$}"

REPO_RESOURCE="projects/${PROJECT}/locations/${REGION}/connections/${CONNECTION}/repositories/${REPO}"

GCS_BUCKET=""
GCS_PUBLIC_BASE_URL=""
GCS_OBJECT_PREFIX="spots"
GCS_CREDS="$ROOT/infra/gcs/.credentials"
if [[ -f "$GCS_CREDS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$GCS_CREDS"
  set +a
fi

if ! gcloud builds connections describe "$CONNECTION" \
  --project="$PROJECT" \
  --region="$REGION" >/dev/null 2>&1; then
  echo "GitHub 連携が未設定です。以下の手順で接続してください:" >&2
  echo "" >&2
  echo "  1. GCP コンソール → Cloud Build → リポジトリ → 第2世代" >&2
  echo "     https://console.cloud.google.com/cloud-build/repositories/2nd-gen?project=${PROJECT}" >&2
  echo "  2. GitHub を接続し、接続名 '${CONNECTION}' で ${REPO} をリンク" >&2
  echo "  3. 再度このスクリプトを実行" >&2
  echo "" >&2
  echo "接続名 / リポジトリ名は環境変数で上書きできます:" >&2
  echo "  CLOUD_BUILD_CONNECTION=${CONNECTION}" >&2
  echo "  CLOUD_BUILD_REPOSITORY=${REPO}" >&2
  exit 1
fi

if ! gcloud builds repositories describe "$REPO" \
  --project="$PROJECT" \
  --region="$REGION" \
  --connection="$CONNECTION" >/dev/null 2>&1; then
  echo "リポジトリ '${REPO}' が接続 '${CONNECTION}' に見つかりません。" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SERVICE_ACCOUNT="projects/${PROJECT}/serviceAccounts/${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

create_or_update_trigger() {
  local name="$1"
  local config="$2"
  shift 2
  local -a extra_args=("$@")

  if gcloud builds triggers describe "$name" \
    --project="$PROJECT" \
    --region="$REGION" >/dev/null 2>&1; then
    echo "Updating trigger '${name}'..."
    local -a sub_args=()
    for arg in "${extra_args[@]}"; do
      if [[ "$arg" == --substitutions=* ]]; then
        sub_args+=(--update-substitutions="${arg#--substitutions=}")
      else
        sub_args+=("$arg")
      fi
    done
    gcloud builds triggers update github "$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --repository="$REPO_RESOURCE" \
      --branch-pattern="$BRANCH" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      "${sub_args[@]}" \
      --quiet
  else
    echo "Creating trigger '${name}'..."
    gcloud builds triggers create github \
      --name="$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --repository="$REPO_RESOURCE" \
      --branch-pattern="$BRANCH" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      "${extra_args[@]}" \
      --quiet
  fi
  echo "  ✓ ${name}"
}

SUBS="_REGION=${REGION},_USE_MOCK=1"
SUBS="${SUBS},_CORS_ORIGINS=https://tabipla-admin-web.web.app%2Chttps://tabipla-admin-web.firebaseapp.com%2Chttps://tabipla-user-web.web.app%2Chttps://tabipla-user-web.firebaseapp.com"
if [[ -n "${GCS_BUCKET:-}" ]]; then
  SUBS="${SUBS},_GCS_BUCKET=${GCS_BUCKET}"
fi
if [[ -n "${GCS_PUBLIC_BASE_URL:-}" ]]; then
  SUBS="${SUBS},_GCS_PUBLIC_BASE_URL=${GCS_PUBLIC_BASE_URL}"
fi
if [[ -n "${GCS_OBJECT_PREFIX:-}" ]]; then
  SUBS="${SUBS},_GCS_OBJECT_PREFIX=${GCS_OBJECT_PREFIX}"
fi

echo "Project:    ${PROJECT}"
echo "Region:     ${REGION}"
echo "Connection: ${CONNECTION}"
echo "Repository: ${REPO}"
echo "Branch:     ${BRANCH}"
echo ""

# agent → backend-api の順でデプロイ（重複トリガーを避けるため 1 本化）
create_or_update_trigger \
  tabipla-deploy-services \
  infra/cloud-build/cloudbuild.deploy.yaml \
  --included-files="services/**,packages/**,infra/cloud-build/**,pnpm-lock.yaml,pnpm-workspace.yaml,package.json" \
  --substitutions="${SUBS}"

echo ""
echo "=== Triggers setup complete ==="
echo ""
echo "手動実行:"
echo "  gcloud builds triggers run tabipla-deploy-services --branch=main --region=${REGION} --project=${PROJECT}"
echo ""
echo "個別デプロイ（手動 submit）:"
echo "  gcloud builds submit . --config=services/agent/cloudbuild.deploy.yaml --substitutions=_IMAGE=gcr.io/${PROJECT}/tabipla-agent"
echo "  gcloud builds submit . --config=services/backend-api/cloudbuild.deploy.yaml --substitutions=_IMAGE=gcr.io/${PROJECT}/tabipla-backend-api"
