#!/usr/bin/env bash
set -euo pipefail

BACKEND_PROJECT="${GOOGLE_CLOUD_PROJECT:-tabipla-user-web}"
ADMIN_FIREBASE_PROJECT="${TABIPLA_ADMIN_FIREBASE_PROJECT:-tabipla-admin-web}"
DEPLOY_SA="tabipla-cloudbuild-deploy@${BACKEND_PROJECT}.iam.gserviceaccount.com"

echo "Backend GCP project: ${BACKEND_PROJECT}"
echo "Admin Firebase project: ${ADMIN_FIREBASE_PROJECT}"
echo "Deploy service account: ${DEPLOY_SA}"
echo ""

for project in "$BACKEND_PROJECT" "$ADMIN_FIREBASE_PROJECT"; do
  echo "Enabling Firebase APIs on ${project}..."
  gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com \
    --project="$project" \
    --quiet
done

grant_firebase_hosting() {
  local project="$1"
  echo "Granting roles/firebasehosting.admin on ${project}..."
  gcloud projects add-iam-policy-binding "$project" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role="roles/firebasehosting.admin" \
    --quiet >/dev/null
  gcloud projects add-iam-policy-binding "$project" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role="roles/firebase.viewer" \
    --quiet >/dev/null 2>&1 || true
  echo "  ✓ ${project}"
}

grant_firebase_hosting "$BACKEND_PROJECT"
grant_firebase_hosting "$ADMIN_FIREBASE_PROJECT"

echo "Granting Cloud Run read access for admin-web URL resolution..."
gcloud projects add-iam-policy-binding "$BACKEND_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/run.viewer" \
  --quiet >/dev/null
echo "  ✓ roles/run.viewer on ${BACKEND_PROJECT}"

echo ""
echo "=== Firebase IAM setup complete ==="
echo ""
echo "Cloud Build SA が Firebase Hosting にデプロイできるようになりました。"
echo "  user-web:  ${BACKEND_PROJECT} (https://${BACKEND_PROJECT}.web.app)"
echo "  admin-web: ${ADMIN_FIREBASE_PROJECT} (https://${ADMIN_FIREBASE_PROJECT}.web.app)"
