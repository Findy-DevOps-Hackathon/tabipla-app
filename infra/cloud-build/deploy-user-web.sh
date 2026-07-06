#!/usr/bin/env bash
# user-web: ビルド → Firebase Hosting（tabipla-user-web）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIREBASE_PROJECT="${TABIPLA_USER_FIREBASE_PROJECT:-tabipla-user-web}"

echo "=== Deploy user-web → ${FIREBASE_PROJECT} ==="
cd "$ROOT"
pnpm --filter @tabipla/user-web build

cd "$ROOT/apps/user-web"
pnpm exec firebase deploy --only hosting --project "${FIREBASE_PROJECT}" --non-interactive

echo "Deployed: https://${FIREBASE_PROJECT}.web.app"
