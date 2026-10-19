"""Collects Reddit posts (and their top comments) for one round of search terms.

App-only OAuth with the app in .env (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET,
REDDIT_USER_AGENT); no user password. Searches each subreddit for each term,
newest first, until posts fall outside the window (Reddit returns at most
~1,000 per search). For each post that really contains its term, the top
comments are pulled as part of the thread. Respects Reddit's rate-limit
headers. Raw responses go to data/raw/reddit/.

    python3 research/pipeline/collect_reddit.py research/studies/01-discovery/queries-r4.json
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from check_matches import matcher
from collect_hn import MIN_WORDS, epoch
from db import ROOT, connect

RAW_DIR = ROOT / "data" / "raw" / "reddit"
ENV = ROOT.parent / ".env"


def load_env() -> dict[str, str]:
    env = {}
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    missing = {"REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"} - env.keys()
    if missing:
        sys.exit(f".env is missing {', '.join(sorted(missing))}")
    return env


class Reddit:
    def __init__(self, env: dict[str, str]):
        self.env = env
        self.token = ""
        self.expires = 0.0
        self.remaining = 100.0
        self.reset = 0.0

    def _auth(self) -> None:
        creds = f"{self.env['REDDIT_CLIENT_ID']}:{self.env['REDDIT_CLIENT_SECRET']}"
        req = urllib.request.Request(
            "https://www.reddit.com/api/v1/access_token",
            data=b"grant_type=client_credentials",
            headers={
                "Authorization": "Basic " + base64.b64encode(creds.encode()).decode(),
                "User-Agent": self.env["REDDIT_USER_AGENT"],
            },
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.load(res)
        if "access_token" not in data:
            sys.exit(f"Reddit didn't issue a token: {data.get('error', data)}")
        self.token = data["access_token"]
        self.expires = time.time() + data.get("expires_in", 3600) - 60

    def get(self, path: str, params: dict) -> dict | list:
        if time.time() > self.expires:
            self._auth()
        if self.remaining < 2:
            time.sleep(max(self.reset, 1))
        url = f"https://oauth.reddit.com{path}?{urllib.parse.urlencode({**params, 'raw_json': 1})}"
        for attempt in range(5):
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {self.token}",
                "User-Agent": self.env["REDDIT_USER_AGENT"],
            })
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    self.remaining = float(res.headers.get("x-ratelimit-remaining", 100))
                    self.reset = float(res.headers.get("x-ratelimit-reset", 0))
                    return json.load(res)
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    time.sleep(float(e.headers.get("x-ratelimit-reset", 2 ** (attempt + 2))))
                    continue
                if e.code == 401:
                    self._auth()
                    continue
                raise
            except OSError:
                time.sleep(2 ** (attempt + 1))
        raise RuntimeError(f"gave up on {url}")


def post_doc(source: str, p: dict, now: int) -> dict | None:
    body = f"{p.get('title', '')}\n\n{p.get('selftext', '')}".strip()
    words = len(body.split())
    if words < MIN_WORDS or p.get("removed_by_category"):
        return None
    return {
        "id": f"rd:{p['name']}", "source": source, "kind": "post",
        "created_at": int(p["created_utc"]), "title": p.get("title"), "text": body,
        "url": f"https://www.reddit.com{p['permalink']}", "points": p.get("score"),
        "thread_id": f"rd:{p['name']}", "parent_id": None, "words": words, "collected_at": now,
    }


def comment_docs(source: str, post: dict, listing: list, limit: int, now: int) -> list[dict]:
    docs = []
    for child in listing[1]["data"]["children"][:limit]:
        c = child.get("data", {})
        if child.get("kind") != "t1" or c.get("body") in (None, "[deleted]", "[removed]"):
            continue
        words = len(c["body"].split())
        if words < MIN_WORDS:
            continue
        docs.append({
            "id": f"rd:{c['name']}", "source": source, "kind": "comment",
            "created_at": int(c["created_utc"]), "title": post.get("title"), "text": c["body"],
            "url": f"https://www.reddit.com{c['permalink']}", "points": c.get("score"),
            "thread_id": f"rd:{post['name']}", "parent_id": f"rd:{post['name']}",
            "words": words, "collected_at": now,
        })
    return docs


def search(api: Reddit, sub: str, q: str, start: int) -> list[dict]:
    posts, after = [], None
    while True:
        params = {"q": q, "restrict_sr": 1, "sort": "new", "t": "all", "limit": 100, "type": "link"}
        if after:
            params["after"] = after
        data = api.get(f"/r/{sub}/search", params)["data"]
        batch = [c["data"] for c in data["children"]]
        posts += [p for p in batch if p["created_utc"] >= start]
        after = data.get("after")
        if not after or not batch or batch[-1]["created_utc"] < start:
            return posts


INSERT = """INSERT OR IGNORE INTO documents
  (id, source, kind, created_at, title, text, url, points, thread_id, parent_id, words, collected_at)
  VALUES (:id, :source, :kind, :created_at, :title, :text, :url, :points,
          :thread_id, :parent_id, :words, :collected_at)"""


def main(path: str) -> None:
    spec = json.loads(open(path).read())
    round_id = spec["round"]
    start, end = epoch(spec["window"]["from"]), epoch(spec["window"]["to"])
    now = int(time.time())
    api = Reddit(load_env())
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    conn = connect()
    conn.execute("INSERT OR IGNORE INTO rounds (id, started_at, note) VALUES (?, ?, ?)",
                 (round_id, now, spec["note"]))
    fetched_threads: set[str] = {
        r[0] for r in conn.execute("SELECT DISTINCT thread_id FROM documents WHERE kind = 'comment' AND source LIKE 'r-%'")
    }

    for sub in spec["subreddits"]:
        source = f"r-{sub.lower()}"
        thread_qid = f"{source}-comments"
        for query in spec["queries"]:
            qid = f"{source}:{query['id']}"
            done = conn.execute("SELECT 1 FROM queries WHERE id = ? AND round_id = ?", (qid, round_id)).fetchone()
            if done:
                continue
            posts = [p for p in search(api, sub, query["q"], start) if p["created_utc"] < end]
            (RAW_DIR / f"r{round_id}-{sub}-{query['id']}.json").write_text(json.dumps(posts))
            match = matcher(query["q"])
            docs = [d for d in (post_doc(source, p, now) for p in posts) if d]
            conn.executemany(INSERT, docs)
            conn.executemany("INSERT OR IGNORE INTO document_queries VALUES (?, ?, ?)",
                             [(d["id"], qid, round_id) for d in docs])

            # Top comments for posts that really contain the term.
            by_id = {p["name"]: p for p in posts}
            for d in docs:
                if not match(d["text"].lower()) or d["id"] in fetched_threads:
                    continue
                post = by_id[d["id"][3:]]
                listing = api.get(f"/r/{sub}/comments/{post['id']}",
                                  {"limit": spec["comments_per_post"], "depth": 1, "sort": "top"})
                comments = comment_docs(source, post, listing, spec["comments_per_post"], now)
                conn.executemany(INSERT, comments)
                conn.executemany("INSERT OR IGNORE INTO document_queries VALUES (?, ?, ?)",
                                 [(c["id"], thread_qid, round_id) for c in comments])
                fetched_threads.add(d["id"])

            conn.execute(
                """INSERT OR REPLACE INTO queries (id, round_id, source, stage, q, hits_total, hits_pulled)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (qid, round_id, source, query["stage"], query["q"], len(posts), len(docs)),
            )
            conn.commit()
            print(f"{qid:<45} {len(posts):>5} posts  {len(docs):>5} kept", flush=True)

        n = conn.execute(
            "SELECT COUNT(*) FROM document_queries WHERE query_id = ? AND round_id = ?", (thread_qid, round_id)
        ).fetchone()[0]
        conn.execute(
            """INSERT OR REPLACE INTO queries (id, round_id, source, stage, q, hits_total, hits_pulled)
               VALUES (?, ?, ?, NULL, '*', ?, ?)""",
            (thread_qid, round_id, source, n, n),
        )
        conn.commit()
        print(f"{thread_qid:<45} {n:>5} comments", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
