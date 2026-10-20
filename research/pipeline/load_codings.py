"""Loads coding results (JSONL from the coding agents) into the database.

Checks every line: the post exists, each code is in the codebook version
used, and each evidence quote really appears in the post (whitespace and
case ignored). Codes whose quote isn't in the post are dropped and counted.

    python3 research/pipeline/load_codings.py <coder> <codebook version> <results.jsonl>...
"""

import json
import re
import sys
import time

from db import connect


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower().strip("\"'“”‘’.… ")


def main(coder: str, version: str, *paths: str) -> None:
    conn = connect()
    valid = {r[0] for r in conn.execute("SELECT id FROM codes WHERE version = ?", (int(version),))}
    now = int(time.time())
    stats = {"lines": 0, "relevant": 0, "codes": 0, "bad_json": 0, "unknown_post": 0,
             "unknown_code": 0, "quote_not_found": 0}
    for path in paths:
        for line in open(path):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                stats["bad_json"] += 1
                continue
            doc = conn.execute("SELECT text FROM documents WHERE id = ?", (row["doc_id"],)).fetchone()
            if not doc:
                stats["unknown_post"] += 1
                continue
            stats["lines"] += 1
            level = row.get("relevance")
            if level is not None:  # codebook v4+: 2 first-hand, 1 discussed, 0 not
                level = int(level)
                relevant = int(level > 0)
                conn.execute("INSERT OR REPLACE INTO coding_meta VALUES (?, ?, ?, ?)",
                             (row["doc_id"], coder, level, row.get("speaker")))
                stats.setdefault("first_hand", 0)
                stats["first_hand"] += level == 2
            else:
                relevant = int(bool(row.get("relevant")))
            stats["relevant"] += relevant
            conn.execute("INSERT OR REPLACE INTO relevance VALUES (?, ?, ?, ?, ?)",
                         (row["doc_id"], coder, relevant, row.get("other"), now))
            conn.execute("DELETE FROM codings WHERE doc_id = ? AND coder = ?", (row["doc_id"], coder))
            text = norm(doc[0])
            for c in ((row.get("codes") or []) if relevant else []):
                if c.get("code") not in valid:
                    stats["unknown_code"] += 1
                    continue
                quote = c.get("evidence") or ""
                if not quote or norm(quote) not in text:
                    stats["quote_not_found"] += 1
                    continue
                conn.execute("INSERT OR REPLACE INTO codings VALUES (?, ?, ?, ?, ?, ?)",
                             (row["doc_id"], c["code"], int(version), coder, quote, now))
                stats["codes"] += 1
    conn.commit()
    print(json.dumps(stats))


if __name__ == "__main__":
    main(*sys.argv[1:])
