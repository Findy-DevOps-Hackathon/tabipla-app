#!/usr/bin/env bash
# 監視通知（Pub/Sub → Cloud Function → Discord）のテスト。
#
# 使い方:
#   export GOOGLE_CLOUD_PROJECT=tabipla-user-web
#   bash infra/monitoring/test-alert.sh          # 障害通知テスト
#   bash infra/monitoring/test-alert.sh recovery # 復旧通知テスト
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
TOPIC="${TABIPLA_ALERT_TOPIC:-tabipla-monitoring-alerts}"
MODE="${1:-open}"

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "GOOGLE_CLOUD_PROJECT を設定してください" >&2
  exit 1
fi

if [[ "$MODE" == "recovery" || "$MODE" == "closed" ]]; then
  STATE="closed"
  POLICY="tabipla-test-recovery"
  SUMMARY="[テスト] 復旧通知の確認"
else
  STATE="open"
  POLICY="tabipla-test-alert"
  SUMMARY="[テスト] 障害通知の確認 — Cloud Monitoring → Discord"
fi

NOW="$(date +%s)"
CONSOLE_URL="https://console.cloud.google.com/monitoring/alerting?project=${PROJECT}"

MESSAGE="$(python3 - "$STATE" "$POLICY" "$SUMMARY" "$CONSOLE_URL" "$NOW" <<'PY'
import json
import sys

state, policy, summary, url, started = sys.argv[1:6]
print(json.dumps({
    "incident": {
        "policy_name": f"projects/test/alertPolicies/{policy}",
        "condition_name": "Test condition",
        "state": state,
        "summary": summary,
        "url": url,
        "started_at": int(started),
    },
    "version": "1.2",
}, ensure_ascii=False))
PY
)"

echo "Publishing test alert to Pub/Sub topic: ${TOPIC}"
echo "  state=${STATE} policy=${POLICY}"
gcloud pubsub topics publish "$TOPIC" \
  --project="$PROJECT" \
  --message="$MESSAGE"

echo ""
echo "Published. 数秒以内に Discord に通知が届くはずです。"
echo "届かない場合:"
echo "  gcloud functions logs read tabipla-discord-notifier --gen2 --region=asia-northeast1 --project=${PROJECT} --limit=20"
