#!/usr/bin/env python3
"""tabipla-agent を Gemini Enterprise Agent Platform Runtime にデプロイする。"""

from __future__ import annotations

import argparse
import json
import sys

try:
    import vertexai
    from vertexai import agent_engines
except ImportError as exc:  # pragma: no cover - deploy-time dependency
    print(
        "google-cloud-aiplatform が必要です: pip install 'google-cloud-aiplatform[agent_engines]>=1.144'",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc

TABIPLA_CLASS_METHODS = [
    {
        "name": "personalizedPlan",
        "api_mode": "",
        "parameters": {
            "type": "object",
            "properties": {
                "likes": {"type": "array", "items": {"type": "string"}},
                "nopes": {"type": "array", "items": {"type": "string"}},
                "likeWeights": {"type": "object"},
                "travelMemory": {"type": "string"},
                "catalog": {"type": "array"},
                "page": {"type": "integer"},
                "limit": {"type": "integer"},
                "planKey": {"type": "string"},
            },
            "required": ["catalog"],
        },
    },
    {
        "name": "askSpot",
        "api_mode": "",
        "parameters": {
            "type": "object",
            "properties": {
                "spotId": {"type": "string"},
                "text": {"type": "string"},
                "image": {"type": "object"},
                "audio": {"type": "object"},
                "userProfileSummary": {"type": "string"},
                "spot": {"type": "object"},
                "facts": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["spotId"],
        },
    },
    {
        "name": "collectSpots",
        "api_mode": "",
        "parameters": {
            "type": "object",
            "properties": {
                "municipality": {"type": "string"},
                "prefecture": {"type": "string"},
                "targetCount": {"type": "integer"},
                "categories": {"type": "array", "items": {"type": "string"}},
                "excludeNames": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["municipality", "prefecture", "categories"],
        },
    },
    {
        "name": "describeSpot",
        "api_mode": "",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "municipality": {"type": "string"},
                "prefecture": {"type": "string"},
                "address": {"type": "string"},
                "mode": {"type": "string"},
            },
            "required": ["name", "municipality", "prefecture"],
        },
    },
    {
        "name": "generateSpotImage",
        "api_mode": "",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "municipality": {"type": "string"},
                "prefecture": {"type": "string"},
                "address": {"type": "string"},
                "referenceImage": {"type": "object"},
            },
            "required": ["name", "municipality", "prefecture"],
        },
    },
]


def parse_key_value_csv(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    values: dict[str, str] = {}
    for pair in raw.split(","):
        if not pair.strip():
            continue
        key, _, value = pair.partition("=")
        if key:
            values[key.strip()] = value.strip()
    return values


def parse_secret_env_vars(raw: str | None) -> dict[str, dict[str, str]]:
    secrets: dict[str, dict[str, str]] = {}
    for env_name, secret_name in parse_key_value_csv(raw).items():
        secrets[env_name] = {"secret": secret_name, "version": "latest"}
    return secrets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--location", default="asia-northeast1")
    parser.add_argument("--display-name", default="tabipla-agent")
    parser.add_argument("--image-uri", required=True)
    parser.add_argument("--env-vars", default="")
    parser.add_argument("--secret-env-vars", default="")
    args = parser.parse_args()

    env_vars: dict[str, str | dict[str, str]] = dict(parse_key_value_csv(args.env_vars))
    env_vars.update(parse_secret_env_vars(args.secret_env_vars))

    vertexai.init(project=args.project, location=args.location)

    config: dict = {
        "display_name": args.display_name,
        "description": "tabipla AI agent on Gemini Enterprise Agent Platform Runtime",
        "container_spec": {"image_uri": args.image_uri},
        "class_methods": TABIPLA_CLASS_METHODS,
        "agent_framework": "custom",
        "min_instances": 0,
        "max_instances": 5,
        "resource_limits": {"cpu": "1", "memory": "1Gi"},
        "container_concurrency": 3,
    }
    if env_vars:
        config["env_vars"] = env_vars

    remote_agent = agent_engines.create(config=config)
    resource_name = remote_agent.api_resource.name
    print(json.dumps({"resource_name": resource_name}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
