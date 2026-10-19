"""Marks which collected posts really contain the term that found them.

A quoted phrase must appear as written; each unquoted word must appear as a
whole word. Case-insensitive, with a space or a hyphen between words and an
optional plural "s" ("context-switching", "standup" both count). A comment's thread title doesn't count, since
the comment may not be about it.

    python3 research/pipeline/check_matches.py
"""

import re

from db import connect


def _loose(term: str) -> str:
    stem = term[:-1] if term.endswith("s") else term
    return r"[\s-]+".join(re.escape(w) for w in stem.split()) + "s?"


def matcher(q: str):
    phrases = re.findall(r'"([^"]+)"', q)
    words = re.sub(r'"[^"]+"', " ", q).split()
    patterns = [re.compile(r"\b" + _loose(t.lower()) + r"\b") for t in phrases + words]
    return lambda text: all(p.search(text) for p in patterns)


def main() -> None:
    conn = connect()
    queries = {
        (qid, rid): matcher(q)
        for qid, rid, q in conn.execute("SELECT id, round_id, q FROM queries")
    }
    rows = conn.execute(
        """SELECT dq.doc_id, dq.query_id, dq.round_id, d.kind, d.text
           FROM document_queries dq JOIN documents d ON d.id = dq.doc_id"""
    ).fetchall()
    checks = []
    for doc_id, qid, rid, _kind, text in rows:
        checks.append((doc_id, qid, rid, int(queries[(qid, rid)](text.lower()))))
    conn.executemany("INSERT OR REPLACE INTO match_checks VALUES (?, ?, ?, ?)", checks)
    conn.commit()

    pulled = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    kept = conn.execute("SELECT COUNT(*) FROM corpus").fetchone()[0]
    print(f"{pulled} pulled, {kept} contain a search term ({kept / pulled:.0%})\n")
    for qid, rid, n, ok in conn.execute(
        """SELECT query_id, round_id, COUNT(*), SUM(exact) FROM match_checks
           GROUP BY query_id, round_id HAVING SUM(exact) * 1.0 / COUNT(*) < 0.9
           ORDER BY COUNT(*) DESC"""
    ):
        print(f"  r{rid} {qid:<20} {ok:>6}/{n:<6} ({ok / n:.0%}) exact")


if __name__ == "__main__":
    main()
