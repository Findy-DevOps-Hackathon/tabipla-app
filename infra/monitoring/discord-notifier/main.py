import base64
import json
import os
from datetime import datetime, timezone

import functions_framework
import requests


@functions_framework.cloud_event
def notify_discord(cloud_event):
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print("DISCORD_WEBHOOK_URL is not set")
        return

    raw = cloud_event.data.get("message", {}).get("data", "")
    if not raw:
        print("Empty payload")
        return

    payload = json.loads(base64.b64decode(raw).decode("utf-8"))
    incident = payload.get("incident", {})
    state = incident.get("state", "unknown")
    summary = incident.get("summary") or incident.get("condition_name") or "Monitoring alert"
    policy = incident.get("policy_name", "").rsplit("/", 1)[-1]
    url = incident.get("url", "")
    started = incident.get("started_at", 0)

    if state == "open":
        title = f"tabipla 障害: {policy}"
        color = 15548997
    else:
        title = f"tabipla 復旧: {policy}"
        color = 5763719

    fields = [
        {"name": "状態", "value": state, "inline": True},
        {"name": "ポリシー", "value": policy or "(unknown)", "inline": True},
    ]
    if started:
        ts = datetime.fromtimestamp(started, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        fields.append({"name": "開始", "value": ts, "inline": True})
    if url:
        fields.append({"name": "詳細", "value": url, "inline": False})
    fields.append({"name": "概要", "value": summary[:1024], "inline": False})

    response = requests.post(
        webhook,
        json={
            "embeds": [{
                "title": title,
                "description": "GCP Cloud Monitoring",
                "color": color,
                "fields": fields,
            }]
        },
        timeout=15,
    )
    response.raise_for_status()
