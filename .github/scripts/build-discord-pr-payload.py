import json
import os
import re
import sys
from collections import Counter


def truncate(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3]}..."


def extract_summary(body: str) -> str:
    if not body.strip():
        return "(説明なし)"

    match = re.search(
        r"##\s*Summary\s*\n(.*?)(?:\n##|\Z)",
        body,
        re.DOTALL | re.IGNORECASE,
    )
    text = match.group(1).strip() if match else body.strip()
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^[-*]\s*\[[ xX]\]\s*", "- ", text, flags=re.MULTILINE)
    return truncate(text, 900)


def summarize_areas(files: list[dict]) -> str:
    if not files:
        return "(変更ファイル情報なし)"

    areas: Counter[str] = Counter()
    for file in files:
        path = file.get("path", "")
        parts = path.split("/")
        if not parts:
            continue

        if parts[0] in {"apps", "services", "packages", "infra"} and len(parts) > 1:
            area = f"{parts[0]}/{parts[1]}"
        else:
            area = parts[0]

        areas[area] += 1

    lines = [f"- `{area}` ({count} files)" for area, count in areas.most_common(12)]
    return truncate("\n".join(lines), 900)


def summarize_commits(commits: list[dict]) -> str:
    if not commits:
        return "(コミット情報なし)"

    lines = []
    for commit in commits[:8]:
        headline = commit.get("messageHeadline") or commit.get("message", "").splitlines()[0]
        if headline:
            lines.append(f"- {headline}")

    if len(commits) > 8:
        lines.append(f"- ...他 {len(commits) - 8} commits")

    return truncate("\n".join(lines), 900)


def load_pr_meta() -> dict:
    meta_path = os.environ.get("PR_META_JSON", "").strip()
    if not meta_path or not os.path.exists(meta_path):
        return {}

    with open(meta_path, encoding="utf-8") as file:
        return json.load(file)


def build_embed() -> dict:
    title = truncate(os.environ.get("PR_TITLE", ""), 240)
    meta = load_pr_meta()
    notify_kind = os.environ.get("NOTIFY_KIND", "merged")

    if notify_kind == "manual":
        embed_title = f"通知テスト: {title}"
        color = 9807270
    else:
        embed_title = f"main にマージ: {title}"
        color = 5763719

    fields = [
        {
            "name": "リリース内容",
            "value": extract_summary(meta.get("body", os.environ.get("PR_BODY", ""))),
            "inline": False,
        },
        {
            "name": "変更箇所",
            "value": summarize_areas(meta.get("files", [])),
            "inline": False,
        },
        {
            "name": "コミット",
            "value": summarize_commits(meta.get("commits", [])),
            "inline": False,
        },
        {
            "name": "Author",
            "value": os.environ["PR_AUTHOR"],
            "inline": True,
        },
        {
            "name": "Branch",
            "value": f"`{os.environ['HEAD_BRANCH']}` -> `{os.environ['BASE_BRANCH']}`",
            "inline": True,
        },
    ]

    merged_by = os.environ.get("MERGED_BY", "").strip()
    if notify_kind != "manual" and merged_by:
        fields.append(
            {
                "name": "Merged by",
                "value": merged_by,
                "inline": True,
            }
        )

    embed = {
        "title": embed_title,
        "url": os.environ["PR_URL"],
        "color": color,
        "fields": fields,
    }

    return embed


json.dump({"embeds": [build_embed()]}, sys.stdout, ensure_ascii=False)
