"""Loads a codebook and a set of hypotheses into the database.

Codebook examples are positions in the open-coding sample, and get stored
as document ids. Running it again replaces the same versions.

    python3 research/pipeline/load_study.py
"""

import json

from db import ROOT, connect

STUDY = ROOT / "studies" / "01-discovery"


def main() -> None:
    conn = connect()
    sample = json.loads((STUDY / "open-coding-sample.json").read_text())["docs"]

    for path in sorted(STUDY.glob("codebook-v*.json")):
        book = json.loads(path.read_text())
        for code in book["codes"]:
            example = sample[code["examples"][0]]["doc_id"] if code["examples"] else None
            conn.execute(
                "INSERT OR REPLACE INTO codes VALUES (?, ?, ?, ?, ?, ?)",
                (code["id"], book["version"], book["round"], code["label"],
                 code["definition"], example),
            )
        print(f"{path.name}: {len(book['codes'])} codes")

    for path in sorted(STUDY.glob("hypotheses-r*.json")):
        spec = json.loads(path.read_text())
        for h in spec["hypotheses"]:
            conn.execute(
                """INSERT OR REPLACE INTO hypotheses
                   (id, version, round_id, statement, disproved_if, status, parent_id)
                   VALUES (?, ?, ?, ?, ?, COALESCE(
                     (SELECT status FROM hypotheses WHERE id = ? AND version = ?), 'open'), ?)""",
                (h["id"], h["version"], spec["round"], h["statement"], h["disproved_if"],
                 h["id"], h["version"], h.get("parent_id")),
            )
        print(f"{path.name}: {len(spec['hypotheses'])} hypotheses")
    conn.commit()


if __name__ == "__main__":
    main()
