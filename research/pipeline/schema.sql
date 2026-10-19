-- Research database. Every step from raw posts to findings is stored here,
-- so the data panel can show how each finding was reached.
--
-- rounds → queries → documents → (relevance, codings) → codes → hypotheses → tests
-- Each round can add queries, codes and hypotheses and rerun tests.

CREATE TABLE IF NOT EXISTS rounds (
  id          INTEGER PRIMARY KEY,
  started_at  INTEGER NOT NULL,
  note        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queries (
  id          TEXT NOT NULL,
  round_id    INTEGER NOT NULL REFERENCES rounds(id),
  source      TEXT NOT NULL,
  stage       TEXT,
  q           TEXT NOT NULL,
  hits_total  INTEGER,            -- what the source reported
  hits_pulled INTEGER,            -- what we stored
  PRIMARY KEY (id, round_id, source)
);

-- One row per post or comment. No author names: we only need what was said.
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,  -- "<source>:<native id>"
  source       TEXT NOT NULL,
  kind         TEXT NOT NULL,     -- story | comment
  created_at   INTEGER NOT NULL,
  title        TEXT,
  text         TEXT NOT NULL,
  url          TEXT NOT NULL,     -- link back to the original
  points       INTEGER,
  thread_id    TEXT,
  parent_id    TEXT,
  words        INTEGER NOT NULL,
  collected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_queries (
  doc_id   TEXT NOT NULL REFERENCES documents(id),
  query_id TEXT NOT NULL,
  round_id INTEGER NOT NULL,
  PRIMARY KEY (doc_id, query_id, round_id)
);

-- Is this post about a pain in a product team's work at all?
CREATE TABLE IF NOT EXISTS relevance (
  doc_id   TEXT NOT NULL REFERENCES documents(id),
  coder    TEXT NOT NULL,         -- model id, or "human"
  relevant INTEGER NOT NULL,      -- 0 | 1
  reason   TEXT,
  coded_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, coder)
);

-- The codebook. Codes are versioned: changing a definition makes a new version.
CREATE TABLE IF NOT EXISTS codes (
  id         TEXT NOT NULL,
  version    INTEGER NOT NULL,
  round_id   INTEGER NOT NULL REFERENCES rounds(id),
  label      TEXT NOT NULL,
  definition TEXT NOT NULL,
  example    TEXT,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS codings (
  doc_id       TEXT NOT NULL REFERENCES documents(id),
  code_id      TEXT NOT NULL,
  code_version INTEGER NOT NULL,
  coder        TEXT NOT NULL,     -- model id, or "human"
  evidence     TEXT,              -- the short span that shows the code
  coded_at     INTEGER NOT NULL,
  PRIMARY KEY (doc_id, code_id, code_version, coder)
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id            TEXT NOT NULL,
  version       INTEGER NOT NULL,
  round_id      INTEGER NOT NULL REFERENCES rounds(id),
  statement     TEXT NOT NULL,
  disproved_if  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',  -- open | supported | disproved | revised
  parent_id     TEXT,             -- the hypothesis this one revises
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS tests (
  id                 INTEGER PRIMARY KEY,
  hypothesis_id      TEXT NOT NULL,
  hypothesis_version INTEGER NOT NULL,
  round_id           INTEGER NOT NULL REFERENCES rounds(id),
  method             TEXT NOT NULL,   -- what was measured, in words
  query_sql          TEXT,            -- the exact query, when it's SQL
  result_json        TEXT NOT NULL,
  verdict            TEXT NOT NULL,   -- supports | disproves | inconclusive
  ran_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS documents_created ON documents(created_at);
CREATE INDEX IF NOT EXISTS codings_code ON codings(code_id, code_version);

-- Did the post really contain the search term? Search APIs match typos and
-- prefixes (an unquoted "Jira" pulled 45k posts, 9% of which say "Jira").
-- Only posts with at least one exact match go into the corpus.
CREATE TABLE IF NOT EXISTS match_checks (
  doc_id   TEXT NOT NULL REFERENCES documents(id),
  query_id TEXT NOT NULL,
  round_id INTEGER NOT NULL,
  exact    INTEGER NOT NULL,      -- 0 | 1
  PRIMARY KEY (doc_id, query_id, round_id)
);

CREATE VIEW IF NOT EXISTS corpus AS
  SELECT d.* FROM documents d
  WHERE EXISTS (SELECT 1 FROM match_checks m WHERE m.doc_id = d.id AND m.exact = 1);
