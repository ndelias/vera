"""Stage 3: AI-disclosure markers and size for a random sample of product MRs.

See studies/04-deep-dive/DESIGN.md. Only the kind of marker found is
stored, never the description or commit text.

    python3 research/pipeline/collect_stage3.py
"""

import random
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from collect_gitlab import get
from db import connect

PROJECT = urllib.parse.quote("gitlab-org/gitlab", safe="")
FROM = int(datetime(2025, 10, 19, tzinfo=timezone.utc).timestamp())
TO = int(datetime(2026, 10, 19, tzinfo=timezone.utc).timestamp())
N, SEED = 6000, 20261020

TOOLS = r"(claude|anthropic|cursor|copilot|codex|openai|gpt|gemini|duo|devin|aider|windsurf|cline|amp|junie)"
MARKERS = [
    ("trailer", re.compile(rf"^\s*(co-authored-by|assisted-by):[^\n]*\b{TOOLS}\b", re.I | re.M)),
    ("generated-with", re.compile(
        rf"\b(generated|written|created)\s+(with|by|using)\s+(\[)?(the\s+help\s+of\s+)?(gitlab\s+)?{TOOLS}\b", re.I)),
    ("generated-with", re.compile(r"\b(generated|written|created)\s+(with|by|using)\s+(an?\s+)?ai\b", re.I)),
    ("assisted-by", re.compile(rf"\b(assisted\s+by|with\s+the\s+help\s+of)\s+(gitlab\s+)?({TOOLS}|ai)\b", re.I)),
    ("robot", re.compile("\U0001F916")),
]


def marker(text: str) -> str | None:
    for kind, pattern in MARKERS:
        if pattern.search(text or ""):
            return kind
    return None


def one(iid: int) -> tuple:
    mr, _ = get(f"projects/{PROJECT}/merge_requests/{iid}")
    commits, _ = get(f"projects/{PROJECT}/merge_requests/{iid}/commits", {"per_page": 100})
    found, where = marker(mr.get("description") or ""), "description"
    if not found:
        for c in commits:
            found = marker(c.get("message") or "")
            if found:
                where = "commit"
                break
    changes = str(mr.get("changes_count") or "")
    return (int(changes) if changes.isdigit() else None, len(commits), found, where if found else None)


def main() -> None:
    conn = connect()
    pool = [r[0] for r in conn.execute(
        """SELECT id FROM gl_mrs WHERE project = 'product' AND state = 'merged' AND merged_at IS NOT NULL
             AND author_role != 'bot' AND labels NOT LIKE '%automation:bot-authored%'
             AND created_at >= ? AND created_at < ? ORDER BY id""", (FROM, TO))]
    sample = random.Random(SEED).sample(pool, N)
    done = {r[0] for r in conn.execute("SELECT mr_id FROM s3_mrs")}
    todo = [m for m in sample if m not in done]
    print(f"{len(pool)} eligible, sample {N}, {len(todo)} to fetch", flush=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, (mr_id, row) in enumerate(zip(todo, ex.map(lambda m: one(int(m.split("!")[1])), todo)), 1):
            conn.execute("INSERT OR REPLACE INTO s3_mrs VALUES (?, ?, ?, ?, ?)", (mr_id, *row))
            if i % 250 == 0:
                conn.commit()
                ai = conn.execute("SELECT COUNT(*) FROM s3_mrs WHERE ai_marker IS NOT NULL").fetchone()[0]
                print(f"{i}/{len(todo)} fetched, {ai} AI-disclosed so far", flush=True)
    conn.commit()


if __name__ == "__main__":
    main()
