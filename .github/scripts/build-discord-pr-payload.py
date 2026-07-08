import json
import os
import sys

title = os.environ.get("PR_TITLE", "")
if len(title) > 200:
    title = f"{title[:197]}..."

message = (
    f"**PR to {os.environ['BASE_BRANCH']}:** [{title}]({os.environ['PR_URL']})\n"
    f"Author: {os.environ['PR_AUTHOR']}\n"
    f"Branch: `{os.environ['HEAD_BRANCH']}` -> `{os.environ['BASE_BRANCH']}`\n"
    f"Repository: {os.environ['REPO']}"
)

json.dump({"content": message}, sys.stdout, ensure_ascii=False)
