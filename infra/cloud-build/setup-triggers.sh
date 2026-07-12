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

GCS_BUCKET=""
GCS_PUBLIC_BASE_URL=""
GCS_OBJECT_PREFIX="spots"
GCS_CREDS="$ROOT/infra/gcs/.credentials"
ES_CREDS="$ROOT/infra/elasticsearch/.credentials"
if [[ -f "$GCS_CREDS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$GCS_CREDS"
  set +a
fi
if [[ -f "$ES_CREDS" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ES_CREDS"
  set +a
  if [[ "${ES_NODE:-}" == *localhost* || "${ES_NODE:-}" == *127.0.0.1* ]]; then
    unset ES_NODE
  fi
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

TRIGGER_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tabipla-triggers.XXXXXX")"
cleanup() {
  rm -rf "$TRIGGER_DIR"
}
trap cleanup EXIT

write_included_files() {
  local -a files=("$@")
  for file in "${files[@]}"; do
    printf "  - '%s'\n" "$file"
  done
}

apply_trigger() {
  local name="$1"
  local config="$2"

  if gcloud builds triggers describe "$name" \
    --project="$PROJECT" \
    --region="$REGION" >/dev/null 2>&1; then
    echo "Updating trigger '${name}'..."
    gcloud builds triggers update github "$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --trigger-config="$config" \
      --quiet
  else
    echo "Creating trigger '${name}'..."
    gcloud builds triggers import \
      --project="$PROJECT" \
      --region="$REGION" \
      --source="$config" \
      --quiet
  fi
  echo "  ✓ ${name}"
}

CI_FILES=(
  "apps/**"
  "services/**"
  "packages/**"
  "biome.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "package.json"
  "**/tsconfig*.json"
  "infra/cloud-build/cloudbuild.ci.yaml"
  ".gitleaks.toml"
)

DEPLOY_FILES=(
  "services/**"
  "packages/**"
  "infra/cloud-build/**"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "package.json"
)

FRONT_DEPLOY_FILES=(
  "apps/user-web/**"
  "apps/admin-web/**"
  "infra/cloud-build/deploy-user-web.sh"
  "infra/cloud-build/deploy-admin-web.sh"
  "infra/cloud-build/cloudbuild.deploy-front.yaml"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "package.json"
)

CORS_ORIGINS="https://tabipla-admin-web.web.app,https://tabipla-admin-web.firebaseapp.com,https://tabipla-user-web.web.app,https://tabipla-user-web.firebaseapp.com"

write_ci_pr_trigger() {
  local out="$TRIGGER_DIR/tabipla-ci.yaml"
  cat >"$out" <<EOF
name: tabipla-ci
filename: infra/cloud-build/cloudbuild.ci.yaml
includedFiles:
$(write_included_files "${CI_FILES[@]}")
repositoryEventConfig:
  repository: ${REPO_RESOURCE}
  pullRequest:
    branch: ${MAIN_BRANCH}
    commentControl: COMMENTS_DISABLED
serviceAccount: ${SERVICE_ACCOUNT}
EOF
  echo "$out"
}

write_ci_push_trigger() {
  local out="$TRIGGER_DIR/tabipla-ci-push.yaml"
  cat >"$out" <<EOF
name: tabipla-ci-push
filename: infra/cloud-build/cloudbuild.ci.yaml
includedFiles:
$(write_included_files "${CI_FILES[@]}")
repositoryEventConfig:
  repository: ${REPO_RESOURCE}
  push:
    branch: .*
serviceAccount: ${SERVICE_ACCOUNT}
EOF
  echo "$out"
}

write_deploy_services_trigger() {
  local out="$TRIGGER_DIR/tabipla-deploy-services.yaml"
  cat >"$out" <<EOF
name: tabipla-deploy-services
filename: infra/cloud-build/cloudbuild.deploy.yaml
includedFiles:
$(write_included_files "${DEPLOY_FILES[@]}")
substitutions:
  _REGION: ${REGION}
  _CORS_ORIGINS: "${CORS_ORIGINS}"
  _GCS_BUCKET: "${GCS_BUCKET}"
  _GCS_PUBLIC_BASE_URL: "${GCS_PUBLIC_BASE_URL}"
  _GCS_OBJECT_PREFIX: ${GCS_OBJECT_PREFIX}
  _ES_NODE: "${ES_NODE:-}"
  _ES_INDEX: "${ES_INDEX:-}"
  _ES_VECTOR_DIMS: "${ES_VECTOR_DIMS:-}"
  _EMBEDDING_PROVIDER: "${EMBEDDING_PROVIDER:-}"
repositoryEventConfig:
  repository: ${REPO_RESOURCE}
  push:
    branch: ${MAIN_BRANCH}
serviceAccount: ${SERVICE_ACCOUNT}
EOF
  echo "$out"
}

write_deploy_front_trigger() {
  local out="$TRIGGER_DIR/tabipla-deploy-front.yaml"
  cat >"$out" <<EOF
name: tabipla-deploy-front
filename: infra/cloud-build/cloudbuild.deploy-front.yaml
includedFiles:
$(write_included_files "${FRONT_DEPLOY_FILES[@]}")
substitutions:
  _REGION: ${REGION}
repositoryEventConfig:
  repository: ${REPO_RESOURCE}
  push:
    branch: ${MAIN_BRANCH}
serviceAccount: ${SERVICE_ACCOUNT}
EOF
  echo "$out"
}

echo "Project:    ${PROJECT}"
echo "Region:     ${REGION}"
echo "Connection: ${CONNECTION}"
echo "Repository: ${REPO}"
echo ""

echo "=== CI triggers ==="
apply_trigger tabipla-ci "$(write_ci_pr_trigger)"
apply_trigger tabipla-ci-push "$(write_ci_push_trigger)"

echo ""
echo "=== CD trigger (backend) ==="
apply_trigger tabipla-deploy-services "$(write_deploy_services_trigger)"

echo ""
echo "=== CD trigger (frontend) ==="
apply_trigger tabipla-deploy-front "$(write_deploy_front_trigger)"

echo ""
echo "=== Triggers setup complete ==="
echo ""
echo "CI 手動実行:"
echo "  gcloud builds submit . --config=infra/cloud-build/cloudbuild.ci.yaml --region=${REGION} --project=${PROJECT} --default-buckets-behavior=regional-user-owned-bucket"
echo ""
echo "CD 手動実行:"
echo "  gcloud builds triggers run tabipla-deploy-services --branch=main --region=${REGION} --project=${PROJECT}"
echo "  gcloud builds triggers run tabipla-deploy-front --branch=main --region=${REGION} --project=${PROJECT}"
