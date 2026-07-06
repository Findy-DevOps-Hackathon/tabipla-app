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
MAIN_BRANCH="${CLOUD_BUILD_BRANCH:-^main$}"

REPO_RESOURCE="projects/${PROJECT}/locations/${REGION}/connections/${CONNECTION}/repositories/${REPO}"
SERVICE_ACCOUNT="projects/${PROJECT}/serviceAccounts/tabipla-cloudbuild-deploy@${PROJECT}.iam.gserviceaccount.com"

CI_INCLUDED_FILES="apps/**,services/**,packages/**,biome.json,pnpm-lock.yaml,pnpm-workspace.yaml,package.json,**/tsconfig*.json,infra/cloud-build/cloudbuild.ci.yaml"
DEPLOY_INCLUDED_FILES="services/**,packages/**,infra/cloud-build/**,pnpm-lock.yaml,pnpm-workspace.yaml,package.json"

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
  exit 1
fi

if ! gcloud builds repositories describe "$REPO" \
  --project="$PROJECT" \
  --region="$REGION" \
  --connection="$CONNECTION" >/dev/null 2>&1; then
  echo "リポジトリ '${REPO}' が接続 '${CONNECTION}' に見つかりません。" >&2
  exit 1
fi

create_or_update_push_trigger() {
  local name="$1"
  local config="$2"
  local branch_pattern="$3"
  shift 3
  local -a extra_args=("$@")

  if gcloud builds triggers describe "$name" \
    --project="$PROJECT" \
    --region="$REGION" >/dev/null 2>&1; then
    echo "Updating push trigger '${name}'..."
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
      --branch-pattern="$branch_pattern" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      "${sub_args[@]}" \
      --quiet
  else
    echo "Creating push trigger '${name}'..."
    gcloud builds triggers create github \
      --name="$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --repository="$REPO_RESOURCE" \
      --branch-pattern="$branch_pattern" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      "${extra_args[@]}" \
      --quiet
  fi
  echo "  ✓ ${name}"
}

create_or_update_pr_trigger() {
  local name="$1"
  local config="$2"
  local pr_pattern="$3"
  shift 3
  local -a extra_args=("$@")

  if gcloud builds triggers describe "$name" \
    --project="$PROJECT" \
    --region="$REGION" >/dev/null 2>&1; then
    echo "Updating PR trigger '${name}'..."
    gcloud builds triggers update github "$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --repository="$REPO_RESOURCE" \
      --pull-request-pattern="$pr_pattern" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      --comment-control=COMMENTS_ENABLED \
      "${extra_args[@]}" \
      --quiet
  else
    echo "Creating PR trigger '${name}'..."
    gcloud builds triggers create github \
      --name="$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --repository="$REPO_RESOURCE" \
      --pull-request-pattern="$pr_pattern" \
      --build-config="$config" \
      --service-account="$SERVICE_ACCOUNT" \
      --comment-control=COMMENTS_ENABLED \
      "${extra_args[@]}" \
      --quiet
  fi
  echo "  ✓ ${name}"
}

DEPLOY_SUBS="_REGION=${REGION},_USE_MOCK=1"
if [[ -n "${GCS_BUCKET:-}" ]]; then
  DEPLOY_SUBS="${DEPLOY_SUBS},_GCS_BUCKET=${GCS_BUCKET}"
fi
if [[ -n "${GCS_PUBLIC_BASE_URL:-}" ]]; then
  DEPLOY_SUBS="${DEPLOY_SUBS},_GCS_PUBLIC_BASE_URL=${GCS_PUBLIC_BASE_URL}"
fi
if [[ -n "${GCS_OBJECT_PREFIX:-}" ]]; then
  DEPLOY_SUBS="${DEPLOY_SUBS},_GCS_OBJECT_PREFIX=${GCS_OBJECT_PREFIX}"
fi

echo "Project:    ${PROJECT}"
echo "Region:     ${REGION}"
echo "Connection: ${CONNECTION}"
echo "Repository: ${REPO}"
echo ""

echo "=== CI triggers ==="
create_or_update_pr_trigger \
  tabipla-ci \
  infra/cloud-build/cloudbuild.ci.yaml \
  "$MAIN_BRANCH" \
  --included-files="$CI_INCLUDED_FILES"

create_or_update_push_trigger \
  tabipla-ci-push \
  infra/cloud-build/cloudbuild.ci.yaml \
  ".*" \
  --included-files="$CI_INCLUDED_FILES"

echo ""
echo "=== CD trigger ==="
create_or_update_push_trigger \
  tabipla-deploy-services \
  infra/cloud-build/cloudbuild.deploy.yaml \
  "$MAIN_BRANCH" \
  --included-files="$DEPLOY_INCLUDED_FILES" \
  --substitutions="${DEPLOY_SUBS}"

echo ""
echo "=== Triggers setup complete ==="
echo ""
echo "CI 手動実行:"
echo "  gcloud builds submit . --config=infra/cloud-build/cloudbuild.ci.yaml --region=${REGION} --project=${PROJECT}"
echo ""
echo "CD 手動実行:"
echo "  gcloud builds triggers run tabipla-deploy-services --branch=main --region=${REGION} --project=${PROJECT}"
