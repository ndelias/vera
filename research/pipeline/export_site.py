"""Exports the small, publishable snapshot the Vera website is built from.

The research database is 159 MB and holds the full text of tens of thousands
of other people's posts, which a public site shouldn't republish. The
snapshot keeps every count the pages compute, short excerpts (with links)
only for posts that were read or coded, and no merge request titles or URLs.

    python3 research/pipeline/export_site.py
"""

import gzip
import json
import shutil
import sqlite3
from pathlib import Path

from db import DB_PATH, ROOT

OUT_DIR = ROOT.parent / "apps" / "panel" / "data"
OUT = OUT_DIR / "site.sqlite"
EXCERPT_CHARS = 600

KEEP_WHOLE = [
    "rounds", "queries", "match_checks", "document_queries", "relevance", "codes", "codings",
    "coding_meta", "hypotheses", "tests", "gl_mr_details", "r6_size", "s3_mrs",
    "ev_scores",
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(OUT)
    schema = (ROOT / "pipeline" / "schema.sql").read_text()
    dst.executescript(schema)

    for table in KEEP_WHOLE:
        cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})")]
        rows = src.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
        dst.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", rows)

    # Posts: every row (for counts), text and links only for read or coded posts.
    published = {r[0] for r in src.execute("SELECT doc_id FROM relevance UNION SELECT doc_id FROM coding_meta")}
    docs = []
    for row in src.execute(
        "SELECT id, source, kind, created_at, title, text, url, points, thread_id, parent_id, words, collected_at FROM documents"
    ):
        id_, source, kind, created, title, text, url, points, thread, parent, words, collected = row
        if id_ in published:
            excerpt = text if len(text) <= EXCERPT_CHARS else text[:EXCERPT_CHARS].rsplit(" ", 1)[0] + " …"
            docs.append((id_, source, kind, created, title, excerpt, url, points, thread, parent, words, collected))
        else:
            docs.append((id_, source, kind, created, None, "", "", None, None, None, words, collected))
    dst.executemany("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", docs)

    # Merge requests: roles and timings only. No titles, labels or URLs, except
    # the one flag the analysis needs (bot-authored by label).
    mrs = [
        (id_, project, iid, None, "", role, reviewers, n, merger,
         "automation:bot-authored" if labels and "automation:bot-authored" in labels else "",
         state, draft, notes, created, merged, closed, "", round_id)
        for id_, project, iid, role, reviewers, n, merger, labels, state, draft, notes, created, merged, closed, round_id
        in src.execute(
            """SELECT id, project, iid, author_role, reviewer_roles, reviewers_n, merger_role, labels, state, draft,
                      notes_n, created_at, merged_at, closed_at, round_id FROM gl_mrs""")
    ]
    dst.executemany("INSERT INTO gl_mrs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", mrs)
    dst.commit()
    dst.execute("VACUUM")
    dst.close()

    shutil.copy(ROOT / "studies" / "03-scoring" / "ranking.json", OUT_DIR / "ranking.json")
    # Study 07's results: counts and shares only, no repository names.
    backlog = ROOT / "findings" / "11-agent-backlog.json"
    if backlog.exists():
        shutil.copy(backlog, OUT_DIR / "agent-backlog.json")
    # The compressed copy is what's committed; the site's build unpacks it.
    with open(OUT, "rb") as f, gzip.open(OUT_DIR / "site.sqlite.gz", "wb", compresslevel=9) as g:
        shutil.copyfileobj(f, g)
    size = OUT.stat().st_size / 1e6
    print(json.dumps({"site_db_mb": round(size, 1), "published_posts": len(published), "posts_counted": len(docs),
                      "merge_requests": len(mrs)}))


if __name__ == "__main__":
    main()
