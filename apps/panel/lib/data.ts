import { all, one } from "./db";

// Stage of a post = the stages of the search terms that really matched it.
const STAGES_OF = `
  SELECT m.doc_id, q.stage FROM match_checks m
  JOIN queries q ON q.id = m.query_id AND q.round_id = m.round_id
  WHERE m.exact = 1`;

export const STAGE_ORDER = [
  "plan", "spec", "design", "build", "review", "qa", "release", "feedback", "docs", "coordination",
] as const;

export type Round = {
  id: number;
  note: string;
  started_at: number;
  queries: number;
  pulled: number;
  exact: number;
};

export function rounds(): Round[] {
  return all<Round>(`
    SELECT r.id, r.note, r.started_at,
      (SELECT COUNT(*) FROM queries q WHERE q.round_id = r.id) AS queries,
      (SELECT COUNT(DISTINCT doc_id) FROM document_queries dq WHERE dq.round_id = r.id) AS pulled,
      (SELECT COUNT(DISTINCT doc_id) FROM match_checks m WHERE m.round_id = r.id AND m.exact = 1) AS exact
    FROM rounds r ORDER BY r.id`);
}

export type Overview = {
  pulled: number;
  corpus: number;
  judged: number;
  relevant: number;
  coded: number;
  first: number;
  last: number;
};

export function overview(): Overview {
  return one<Overview>(`
    SELECT
      (SELECT COUNT(*) FROM documents) AS pulled,
      (SELECT COUNT(*) FROM corpus) AS corpus,
      (SELECT COUNT(DISTINCT doc_id) FROM relevance) AS judged,
      (SELECT COUNT(DISTINCT doc_id) FROM relevance WHERE relevant = 1) AS relevant,
      (SELECT COUNT(DISTINCT doc_id) FROM codings) AS coded,
      (SELECT MIN(created_at) FROM corpus) AS first,
      (SELECT MAX(created_at) FROM corpus) AS last`)!;
}

export type StageCount = { stage: string; posts: number; judged: number; relevant: number };

export function stageCounts(): StageCount[] {
  const rows = all<StageCount>(`
    WITH s AS (SELECT DISTINCT doc_id, stage FROM (${STAGES_OF}))
    SELECT s.stage,
      COUNT(DISTINCT s.doc_id) AS posts,
      COUNT(DISTINCT r.doc_id) AS judged,
      COUNT(DISTINCT CASE WHEN r.relevant = 1 THEN r.doc_id END) AS relevant
    FROM s LEFT JOIN relevance r ON r.doc_id = s.doc_id
    GROUP BY s.stage`);
  return rows.sort((a, b) => b.posts - a.posts);
}

export type MonthCount = { month: string; posts: number };

export function postsByMonth(): MonthCount[] {
  return all<MonthCount>(`
    SELECT strftime('%Y-%m', created_at, 'unixepoch') AS month, COUNT(*) AS posts
    FROM corpus GROUP BY month ORDER BY month`);
}

export type QueryRow = {
  id: string;
  round_id: number;
  stage: string;
  q: string;
  hits_total: number;
  hits_pulled: number;
  exact: number;
};

export function queryRows(): QueryRow[] {
  return all<QueryRow>(`
    SELECT q.id, q.round_id, q.stage, q.q, q.hits_total, q.hits_pulled,
      COALESCE((SELECT SUM(exact) FROM match_checks m
                WHERE m.query_id = q.id AND m.round_id = q.round_id), 0) AS exact
    FROM queries q ORDER BY q.round_id, q.stage, q.id`);
}

export type PostFilters = {
  stage?: string;
  round?: number;
  query?: string;
  judged?: "relevant" | "not-relevant" | "unjudged";
  q?: string;
  page: number;
};

export type PostRow = {
  id: string;
  created_at: number;
  kind: string;
  title: string | null;
  excerpt: string;
  words: number;
  truncated: number;
  points: number | null;
  url: string;
  stages: string;
  relevant: number | null;
};

export const PAGE_SIZE = 50;

export function posts(f: PostFilters): { rows: PostRow[]; total: number } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.stage) {
    where.push(`d.id IN (SELECT doc_id FROM (${STAGES_OF}) WHERE stage = ?)`);
    params.push(f.stage);
  }
  if (f.round) {
    where.push(`d.id IN (SELECT doc_id FROM match_checks WHERE round_id = ? AND exact = 1)`);
    params.push(f.round);
  }
  if (f.query) {
    where.push(`d.id IN (SELECT doc_id FROM match_checks WHERE query_id = ? AND exact = 1)`);
    params.push(f.query);
  }
  if (f.judged === "relevant") where.push(`d.id IN (SELECT doc_id FROM relevance WHERE relevant = 1)`);
  if (f.judged === "not-relevant") where.push(`d.id IN (SELECT doc_id FROM relevance WHERE relevant = 0)`);
  if (f.judged === "unjudged") where.push(`d.id NOT IN (SELECT doc_id FROM relevance)`);
  if (f.q) {
    where.push(`(d.text LIKE ? OR d.title LIKE ?)`);
    params.push(`%${f.q}%`, `%${f.q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = one<{ n: number }>(`SELECT COUNT(*) AS n FROM corpus d ${clause}`, ...params)!.n;
  const rows = all<PostRow>(
    `SELECT d.id, d.created_at, d.kind, d.title, substr(d.text, 1, 320) AS excerpt, d.words, length(d.text) > 320 AS truncated,
       d.points, d.url,
       (SELECT group_concat(DISTINCT stage) FROM (${STAGES_OF}) s WHERE s.doc_id = d.id) AS stages,
       (SELECT relevant FROM relevance r WHERE r.doc_id = d.id LIMIT 1) AS relevant
     FROM corpus d ${clause}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params, PAGE_SIZE, (f.page - 1) * PAGE_SIZE,
  );
  return { rows, total };
}

export type Post = {
  id: string;
  source: string;
  kind: string;
  created_at: number;
  title: string | null;
  text: string;
  url: string;
  points: number | null;
  words: number;
};

export type PostMatch = { query_id: string; round_id: number; q: string; stage: string; exact: number };
export type PostJudgment = { coder: string; relevant: number; reason: string | null };
export type PostCoding = { code_id: string; code_version: number; label: string; coder: string; evidence: string | null };

export function post(id: string) {
  const doc = one<Post>(`SELECT * FROM documents WHERE id = ?`, id);
  if (!doc) return null;
  return {
    doc,
    matches: all<PostMatch>(
      `SELECT m.query_id, m.round_id, q.q, q.stage, m.exact FROM match_checks m
       JOIN queries q ON q.id = m.query_id AND q.round_id = m.round_id
       WHERE m.doc_id = ? ORDER BY m.round_id, m.query_id`, id),
    judgments: all<PostJudgment>(`SELECT coder, relevant, reason FROM relevance WHERE doc_id = ?`, id),
    codings: all<PostCoding>(
      `SELECT c.code_id, c.code_version, k.label, c.coder, c.evidence FROM codings c
       JOIN codes k ON k.id = c.code_id AND k.version = c.code_version
       WHERE c.doc_id = ?`, id),
  };
}

export type Code = {
  id: string;
  version: number;
  round_id: number;
  label: string;
  definition: string;
  example: string | null;
  example_excerpt: string | null;
  posts: number;
};

export function codebook(): Code[] {
  return all<Code>(`
    SELECT k.id, k.version, k.round_id, k.label, k.definition, k.example,
      substr(d.text, 1, 220) AS example_excerpt,
      (SELECT COUNT(DISTINCT doc_id) FROM codings c
       WHERE c.code_id = k.id AND c.code_version = k.version) AS posts
    FROM codes k
    LEFT JOIN documents d ON d.id = k.example
    WHERE k.version = (SELECT MAX(version) FROM codes k2 WHERE k2.id = k.id)
    ORDER BY posts DESC, k.rowid`);
}

export type Hypothesis = {
  id: string;
  version: number;
  round_id: number;
  statement: string;
  disproved_if: string;
  status: string;
  parent_id: string | null;
};

export type Test = {
  id: number;
  hypothesis_id: string;
  hypothesis_version: number;
  round_id: number;
  method: string;
  query_sql: string | null;
  result_json: string;
  verdict: string;
  ran_at: number;
};

export function hypotheses(): { hypothesis: Hypothesis; history: Hypothesis[]; tests: Test[] }[] {
  const every = all<Hypothesis>(`SELECT * FROM hypotheses ORDER BY id, version`);
  const tests = all<Test>(`SELECT * FROM tests ORDER BY ran_at`);
  const ids = [...new Set(every.map((h) => h.id))];
  return ids.map((id) => {
    const history = every.filter((h) => h.id === id);
    return {
      hypothesis: history[history.length - 1],
      history: history.slice(0, -1),
      tests: tests.filter((t) => t.hypothesis_id === id),
    };
  });
}
