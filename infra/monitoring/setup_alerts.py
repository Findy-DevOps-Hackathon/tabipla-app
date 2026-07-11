#!/usr/bin/env python3
"""Cloud Monitoring の通知チャネルとアラートポリシーを REST API で作成する。"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = os.environ["GOOGLE_CLOUD_PROJECT"]
PUBSUB_TOPIC = os.environ.get("TABIPLA_ALERT_TOPIC", "tabipla-monitoring-alerts")
CLOUD_SQL_INSTANCE = os.environ.get("TABIPLA_CLOUD_SQL_INSTANCE", "tabipla-db-tokyo")
CHANNEL_DISPLAY_NAME = "tabipla-ops-discord"
API_BASE = f"https://monitoring.googleapis.com/v3/projects/{PROJECT}"


def access_token() -> str:
    return subprocess.check_output(
        ["gcloud", "auth", "print-access-token"],
        text=True,
        timeout=30,
    ).strip()


def api_request(method: str, url: str, body: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token()}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        print(f"Monitoring API error ({exc.code}): {detail}", file=sys.stderr)
        raise


def find_notification_channel() -> str | None:
    query = urllib.parse.urlencode({"filter": f'displayName="{CHANNEL_DISPLAY_NAME}"'})
    data = api_request("GET", f"{API_BASE}/notificationChannels?{query}")
    channels = data.get("notificationChannels", [])
    return channels[0]["name"] if channels else None


def create_notification_channel() -> str:
    body = {
        "type": "pubsub",
        "displayName": CHANNEL_DISPLAY_NAME,
        "labels": {"topic": f"projects/{PROJECT}/topics/{PUBSUB_TOPIC}"},
        "enabled": True,
    }
    data = api_request("POST", f"{API_BASE}/notificationChannels", body)
    return data["name"]


def find_alert_policy(display_name: str) -> str | None:
    query = urllib.parse.urlencode({"filter": f'displayName="{display_name}"'})
    data = api_request("GET", f"{API_BASE}/alertPolicies?{query}")
    policies = data.get("alertPolicies", [])
    return policies[0]["name"] if policies else None


def create_alert_policy(
    display_name: str,
    condition_display_name: str,
    condition_filter: str,
    threshold_value: float,
    duration: str,
    aggregations: list[dict],
    notification_channel: str,
) -> None:
    body = {
        "displayName": display_name,
        "combiner": "OR",
        "enabled": True,
        "notificationChannels": [notification_channel],
        "conditions": [
            {
                "displayName": condition_display_name,
                "conditionThreshold": {
                    "filter": condition_filter,
                    "comparison": "COMPARISON_GT",
                    "thresholdValue": threshold_value,
                    "duration": duration,
                    "aggregations": aggregations,
                },
            }
        ],
    }
    api_request("POST", f"{API_BASE}/alertPolicies", body)


def cloud_sql_exists() -> bool:
    try:
        subprocess.run(
            [
                "gcloud",
                "sql",
                "instances",
                "describe",
                CLOUD_SQL_INSTANCE,
                f"--project={PROJECT}",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def ensure_policy(
    channel: str,
    display_name: str,
    condition_display_name: str,
    condition_filter: str,
    threshold_value: float,
    duration: str,
    aggregations: list[dict],
) -> None:
    if find_alert_policy(display_name):
        print(f"Exists: alert policy {display_name}")
        return
    print(f"Creating alert policy {display_name}...")
    create_alert_policy(
        display_name,
        condition_display_name,
        condition_filter,
        threshold_value,
        duration,
        aggregations,
        channel,
    )
    print(f"Created: alert policy {display_name}")


def main() -> None:
    print("Setting up Monitoring resources via REST API...")

    channel = find_notification_channel()
    if channel:
        print(f"Exists: notification channel {CHANNEL_DISPLAY_NAME}")
    else:
        print("Creating notification channel...")
        channel = create_notification_channel()
        print("Created: notification channel")

    agg_rate_sum = [
        {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.label.service_name"],
        }
    ]
    agg_mean = [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_MEAN"}]

    print("")
    print("--- Alert Policies ---")

    ensure_policy(
        channel,
        "tabipla-cloudrun-5xx-backend-api",
        "Cloud Run 5xx (backend-api)",
        'resource.type="cloud_run_revision" AND resource.labels.service_name="tabipla-backend-api" '
        'AND metric.type="run.googleapis.com/request_count" '
        'AND metric.labels.response_code_class="5xx"',
        3,
        "300s",
        agg_rate_sum,
    )
    ensure_policy(
        channel,
        "tabipla-cloudrun-5xx-agent",
        "Cloud Run 5xx (agent)",
        'resource.type="cloud_run_revision" AND resource.labels.service_name="tabipla-agent" '
        'AND metric.type="run.googleapis.com/request_count" '
        'AND metric.labels.response_code_class="5xx"',
        3,
        "300s",
        agg_rate_sum,
    )

    if cloud_sql_exists():
        ensure_policy(
            channel,
            "tabipla-cloudsql-high-cpu",
            "Cloud SQL CPU > 80%",
            f'resource.type="cloudsql_database" AND resource.labels.database_id="{PROJECT}:{CLOUD_SQL_INSTANCE}" '
            'AND metric.type="cloudsql.googleapis.com/database/cpu/utilization"',
            0.8,
            "600s",
            agg_mean,
        )
    else:
        print(f"SKIP: Cloud SQL instance {CLOUD_SQL_INSTANCE} が見つかりません")


if __name__ == "__main__":
    main()
