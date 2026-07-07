#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== tabipla Cloud Build CD セットアップ ==="
echo ""

bash infra/cloud-build/setup-secrets.sh
echo ""
bash infra/cloud-build/setup-iam.sh
echo ""
bash infra/cloud-build/setup-firebase-iam.sh
echo ""
bash infra/cloud-build/setup-triggers.sh

echo ""
echo "=== すべて完了 ==="
echo ""
echo "初回デプロイ（Secret 設定後）:"
echo "  # backend (agent / backend-api)"
echo "  gcloud builds submit . \\"
echo "    --project=\$(gcloud config get-value project) \\"
echo "    --region=asia-northeast1 \\"
echo "    --default-buckets-behavior=regional-user-owned-bucket \\"
echo "    --config=infra/cloud-build/cloudbuild.deploy.yaml"
echo ""
echo "  # frontend (user-web / admin-web → Firebase Hosting)"
echo "  gcloud builds submit . \\"
echo "    --project=\$(gcloud config get-value project) \\"
echo "    --region=asia-northeast1 \\"
echo "    --default-buckets-behavior=regional-user-owned-bucket \\"
echo "    --config=infra/cloud-build/cloudbuild.deploy-front.yaml"
echo ""
echo "またはトリガー手動実行:"
echo "  gcloud builds triggers run tabipla-deploy-services --branch=main --region=asia-northeast1"
echo "  gcloud builds triggers run tabipla-deploy-front --branch=main --region=asia-northeast1"
