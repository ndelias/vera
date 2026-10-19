"""Collects every question and answer from Stack Exchange sites in a window.

Uses the public Stack Exchange API (no key: 300 requests a day per IP, and
no page past 25, so the window is pulled in 90-day slices). A query with
q "*" means the whole site. Raw pages go to data/raw/se/.

    python3 research/pipeline/collect_se.py research/studies/01-discovery/queries-r3.json
"""

import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from collect_hn import MIN_WORDS, epoch, to_text
from db import ROOT, connect

API = "https://api.stackexchange.com/2.3"
SLICE = 90 * 24 * 3600
RAW_DIR = ROOT / "data" / "raw" / "se"
# Default filter plus the post body.
FILTER = "withbody"


def get(path: str, params: dict) -> dict:
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as res:
                data = json.loads(gzip.decompress(res.read()))
            if data.get("backoff"):
                time.sleep(data["backoff"] + 1)
            return data
        except urllib.error.HTTPError as e:
            body = gzip.decompress(e.read()) if e.headers.get("Content-Encoding") == "gzip" else e.read()
            if attempt == 3 or e.code in (400, 403):
                raise RuntimeError(f"{e.code} {body[:300]!r} for {url}") from e
            time.sleep(2 ** (attempt + 1))
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError("unreachable")


def pull(site: str, kind: str, start: int, end: int) -> tuple[list[dict], int]:
    items, quota = [], None
    for lo in range(start, end, SLICE):
        got, quota = pull_slice(site, kind, lo, min(lo + SLICE, end))
        items += got
    return items, quota


def pull_slice(site: str, kind: str, start: int, end: int) -> tuple[list[dict], int]:
    items, page, quota = [], 1, None
    while True:
        data = get(kind, {
            "site": site, "fromdate": start, "todate": end, "filter": FILTER,
            "pagesize": 100, "page": page, "order": "asc", "sort": "creation",
        })
        items += data["items"]
        quota = data.get("quota_remaining")
        if not data.get("has_more"):
            return items, quota
        page += 1
        time.sleep(0.3)


def to_document(site: str, kind: str, item: dict, titles: dict[int, str], now: int) -> dict | None:
    if kind == "questions":
        title = item.get("title", "")
        body = f"{to_text(title)}\n\n{to_text(item.get('body'))}".strip()
        native, thread = item["question_id"], item["question_id"]
    else:
        title = titles.get(item["question_id"])
        body = to_text(item.get("body"))
        native, thread = item["answer_id"], item["question_id"]
    words = len(body.split())
    if words < MIN_WORDS:
        return None
    return {
        "id": f"{site}-se:{native}",
        "source": f"{site}-se",
        "kind": "question" if kind == "questions" else "answer",
        "created_at": item["creation_date"],
        "title": to_text(title) if title else None,
        "text": body,
        "url": f"https://{site}.stackexchange.com/{'q' if kind == 'questions' else 'a'}/{native}",
        "points": item.get("score"),
        "thread_id": f"{site}-se:{thread}",
        "parent_id": f"{site}-se:{thread}" if kind == "answers" else None,
        "words": words,
        "collected_at": now,
    }


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
        site = query["site"]
        questions, _ = pull(site, "questions", start, end)
        answers, quota = pull(site, "answers", start, end)
        (RAW_DIR / f"r{round_id}-{query['id']}.json").write_text(
            json.dumps({"questions": questions, "answers": answers}))

        titles = {q["question_id"]: q.get("title", "") for q in questions}
        docs = [d for d in (
            [to_document(site, "questions", q, titles, now) for q in questions]
            + [to_document(site, "answers", a, titles, now) for a in answers]
        ) if d]
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
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (query["id"], round_id, f"{site}-se", query["stage"], query["q"],
             len(questions) + len(answers), len(docs)),
        )
        conn.commit()
        print(f"{query['id']:<10} {len(questions):>5} questions {len(answers):>5} answers"
              f"  {len(docs):>5} kept  (quota left {quota})")


if __name__ == "__main__":
    main(sys.argv[1])
