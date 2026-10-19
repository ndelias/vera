"""Collects Hacker News posts and comments for one round of search terms.

Uses HN's public search API (hn.algolia.com). It returns at most 1,000 hits
per search, so a time window that has more gets split in half until each
piece fits. Raw responses go to data/raw/hn/ and documents go to the database.

    python3 research/pipeline/collect_hn.py research/studies/01-discovery/queries.json
"""

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

from db import ROOT, connect

API = "https://hn.algolia.com/api/v1/search_by_date"
PAGE_LIMIT = 1000
MIN_WORDS = 15
RAW_DIR = ROOT / "data" / "raw" / "hn"


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "p":
            self.parts.append("\n\n")

    def handle_data(self, data):
        self.parts.append(data)


def to_text(markup: str | None) -> str:
    if not markup:
        return ""
    parser = _Text()
    parser.feed(markup)
    text = html.unescape("".join(parser.parts))
    return re.sub(r"[ \t]+", " ", text).strip()


def search(q: str, start: int, end: int) -> dict:
    params = {
        "query": q,
        "tags": "(story,comment)",
        "numericFilters": f"created_at_i>={start},created_at_i<{end}",
        "hitsPerPage": PAGE_LIMIT,
        "advancedSyntax": "true",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as res:
                return json.load(res)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def collect(q: str, start: int, end: int) -> tuple[list[dict], int]:
    """All hits for q in [start, end), splitting windows that are too big."""
    first = search(q, start, end)
    time.sleep(0.2)
    if first["nbHits"] <= PAGE_LIMIT or end - start < 3600:
        return first["hits"], first["nbHits"]
    mid = (start + end) // 2
    left, n_left = collect(q, start, mid)
    right, n_right = collect(q, mid, end)
    return left + right, n_left + n_right


def to_document(hit: dict, now: int) -> dict | None:
    tags = hit.get("_tags", [])
    kind = "story" if "story" in tags else "comment"
    if kind == "story":
        title = hit.get("title") or ""
        text = to_text(hit.get("story_text"))
        body = f"{title}\n\n{text}".strip()
    else:
        title = hit.get("story_title")
        body = to_text(hit.get("comment_text"))
    words = len(body.split())
    if words < MIN_WORDS:
        return None
    native = hit["objectID"]
    return {
        "id": f"hn:{native}",
        "source": "hn",
        "kind": kind,
        "created_at": hit["created_at_i"],
        "title": title,
        "text": body,
        "url": f"https://news.ycombinator.com/item?id={native}",
        "points": hit.get("points"),
        "thread_id": str(hit["story_id"]) if hit.get("story_id") else None,
        "parent_id": str(hit["parent_id"]) if hit.get("parent_id") else None,
        "words": words,
        "collected_at": now,
    }


def epoch(day: str) -> int:
    return int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp())


def main(path: str) -> None:
    spec = json.loads(open(path).read())
    round_id = spec["round"]
    start, end = epoch(spec["window"]["from"]), epoch(spec["window"]["to"])
    now = int(time.time())
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    conn = connect()
    conn.execute(
        "INSERT OR IGNORE INTO rounds (id, started_at, note) VALUES (?, ?, ?)",
        (round_id, now, spec["note"]),
    )

    for query in spec["queries"]:
        hits, total = collect(query["q"], start, end)
        (RAW_DIR / f"r{round_id}-{query['id']}.json").write_text(json.dumps(hits))

        docs = [d for d in (to_document(h, now) for h in hits) if d]
        conn.executemany(
            """INSERT OR IGNORE INTO documents
               (id, source, kind, created_at, title, text, url, points,
                thread_id, parent_id, words, collected_at)
               VALUES (:id, :source, :kind, :created_at, :title, :text, :url,
                       :points, :thread_id, :parent_id, :words, :collected_at)""",
            docs,
        )
        conn.executemany(
            "INSERT OR IGNORE INTO document_queries VALUES (?, ?, ?)",
            [(d["id"], query["id"], round_id) for d in docs],
        )
        conn.execute(
            """INSERT OR REPLACE INTO queries
               (id, round_id, source, stage, q, hits_total, hits_pulled)
               VALUES (?, ?, 'hn', ?, ?, ?, ?)""",
            (query["id"], round_id, query["stage"], query["q"], total, len(docs)),
        )
        conn.commit()
        print(f"{query['id']:<20} {total:>6} hits  {len(docs):>6} kept")

    n = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    print(f"\n{n} documents in the database")


if __name__ == "__main__":
    main(sys.argv[1])
