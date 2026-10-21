import { readFileSync } from "node:fs";
import path from "node:path";
import { all, one } from "./db";

// The case page's numbers come from the research database or the committed
// findings files. Two exceptions are typed in, both from findings/05-sample.md
// (an exploratory, source-weighted estimate): the share of relevant posts in
// the AI-change cluster. The copy and competitor summaries are in
// case-content.ts and cite their sources.

const SAMPLE_CODER = "cc-agents/claude-opus-5-5/v4-sample";

type TestRow = { hypothesis_id: string; result_json: string; verdict: string };

function latestTest<T>(id: string): { verdict: string; result: T } | null {
  const row = one<TestRow>(
    `SELECT hypothesis_id, result_json, verdict FROM tests WHERE hypothesis_id = ? ORDER BY id DESC LIMIT 1`,
    id,
  );
  return row ? { verdict: row.verdict, result: JSON.parse(row.result_json) as T } : null;
}

export type Headline = {
  linesFirst: number;
  linesLast: number;
  mergeHoursFirst: number;
  mergeHoursLast: number;
  aiShareFirst: number;
  aiShareLast: number;
  crossRoleRatio: number;
  crossRoleCi: [number, number] | null;
  attentionDrop: number;
  clusterShare: number;
  clusterShareFirstHand: number;
};

type R1 = { quarterly_median_hours: number[] };
type R6 = { median_lines_per_mr: number[] };
type R5 = { ratio: number; ratio_95ci: [number, number] | null };

export function headline(): Headline {
  const r1 = latestTest<R1>("R1")!.result;
  const r6 = latestTest<R6>("R6")!.result;
  const r5 = latestTest<R5>("R5")!.result;
  const ai = aiAdoption();
  const notes = commentsPerQuarter();
  const lines = r6.median_lines_per_mr;
  const perLineFirst = notes[0]! / lines[0]!;
  const perLineLast = notes[notes.length - 1]! / lines[lines.length - 1]!;
  return {
    linesFirst: lines[0]!,
    linesLast: lines[lines.length - 1]!,
    mergeHoursFirst: r1.quarterly_median_hours[0]!,
    mergeHoursLast: r1.quarterly_median_hours[r1.quarterly_median_hours.length - 1]!,
    aiShareFirst: ai[0]?.share ?? 0,
    aiShareLast: ai[ai.length - 1]?.share ?? 0,
    crossRoleRatio: r5.ratio,
    crossRoleCi: r5.ratio_95ci,
    attentionDrop: 1 - perLineLast / perLineFirst,
    clusterShare: 0.385, // findings/05-sample.md
    clusterShareFirstHand: 0.46, // findings/05-sample.md
  };
}

/** Share of sampled GitLab MRs disclosing AI help, by month. */
export function aiAdoption(): { month: string; share: number; n: number }[] {
  return all<{ month: string; share: number; n: number }>(`
    SELECT strftime('%Y-%m', m.created_at, 'unixepoch') AS month,
           AVG(s.ai_marker IS NOT NULL) AS share, COUNT(*) AS n
    FROM s3_mrs s JOIN gl_mrs m ON m.id = s.mr_id
    GROUP BY month ORDER BY month`);
}

const QUARTERS = ["Q4 '24", "Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26", "Q2 '26", "Q3 '26"];

/** Median lines per MR and median hours to merge, per quarter (R6, R1). */
export function volumeVsSpeed(): { quarter: string; lines: number; hours: number }[] {
  const r1 = latestTest<R1>("R1")!.result.quarterly_median_hours;
  const r6 = latestTest<R6>("R6")!.result.median_lines_per_mr;
  return QUARTERS.map((quarter, i) => ({ quarter, lines: r6[i] ?? 0, hours: r1[i] ?? 0 }));
}

function commentsPerQuarter(): number[] {
  const rows = all<{ q: number; notes: number }>(`
    SELECT ((CAST(strftime('%Y', created_at, 'unixepoch') AS INTEGER) - 2024) * 4
            + (CAST(strftime('%m', created_at, 'unixepoch') AS INTEGER) - 1) / 3 - 3) AS q,
           notes_n AS notes
    FROM gl_mrs WHERE project = 'product' AND state = 'merged' AND merged_at IS NOT NULL
      AND author_role != 'bot' AND labels NOT LIKE '%automation:bot-authored%'`);
  const by: number[][] = Array.from({ length: 8 }, () => []);
  for (const r of rows) if (r.q >= 0 && r.q <= 7) by[r.q]!.push(r.notes);
  return by.map((v) => {
    const s = [...v].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  });
}

export type Voice = {
  code: string;
  evidence: string;
  docId: string;
  source: string;
  url: string;
  createdAt: number;
  speaker: string | null;
};

/**
 * First-hand accounts for a pain, picked by a fixed rule so none are
 * hand-chosen: posts where the writer's role is known come first, then the
 * longest evidence span, then the post id.
 */
export function voices(codes: string[], perCode = 2): Voice[] {
  const rows = all<Voice>(
    `SELECT c.code_id AS code, c.evidence, d.id AS docId, d.source, d.url, d.created_at AS createdAt, m.speaker
     FROM codings c
     JOIN coding_meta m ON m.doc_id = c.doc_id AND m.coder = c.coder
     JOIN documents d ON d.id = c.doc_id
     WHERE c.coder = ? AND m.level = 2 AND c.code_id IN (${codes.map(() => "?").join(",")})
       AND c.evidence IS NOT NULL
     ORDER BY c.code_id, (m.speaker IS NULL OR m.speaker = 'unknown'), LENGTH(c.evidence) DESC, d.id`,
    SAMPLE_CODER,
    ...codes,
  );
  const seen = new Set<string>();
  const out: Voice[] = [];
  for (const code of codes) {
    for (const r of rows.filter((r) => r.code === code)) {
      if (out.filter((v) => v.code === code).length >= perCode) break;
      if (seen.has(r.docId)) continue;
      seen.add(r.docId);
      out.push(r);
    }
  }
  return out;
}

export type Ranked = {
  rank: number;
  code: string;
  label: string;
  score: number;
  frequency: number;
  cost: number;
  buyer: number;
  gap: number;
  agent_fit: number;
  share: number;
  share_first_hand: number;
  top3_under_nudging: number;
};

export function ranking(): Ranked[] {
  const file = path.resolve(process.cwd(), "data/ranking.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { ranking: Ranked[] }).ranking;
}

export type Method = {
  pulled: number;
  corpus: number;
  readByHand: number;
  coded: number;
  mrs: number;
  hypotheses: { supported: number; disproved: number; open: number };
  rounds: number;
};

export function method(): Method {
  const h = all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM hypotheses h
     WHERE version = (SELECT MAX(version) FROM hypotheses h2 WHERE h2.id = h.id) GROUP BY status`,
  );
  const get = (s: string) => h.find((x) => x.status === s)?.n ?? 0;
  return {
    ...one<Omit<Method, "hypotheses">>(`
      SELECT (SELECT COUNT(*) FROM documents) AS pulled,
             (SELECT COUNT(*) FROM corpus) AS corpus,
             (SELECT COUNT(DISTINCT doc_id) FROM relevance WHERE coder = 'claude-opus-5-5') AS readByHand,
             (SELECT COUNT(DISTINCT doc_id) FROM coding_meta WHERE coder = '${SAMPLE_CODER}') AS coded,
             (SELECT COUNT(*) FROM gl_mrs WHERE created_at >= 1729296000) AS mrs,
             (SELECT COUNT(*) FROM rounds) AS rounds`)!,
    hypotheses: { supported: get("supported"), disproved: get("disproved"), open: get("open") },
  };
}

/** The coded sample, by relevance level (codebook v4). */
export function sampleCounts(): { firstHand: number; discussed: number; other: number } {
  const rows = all<{ level: number; n: number }>(
    `SELECT level, COUNT(*) AS n FROM coding_meta WHERE coder = ? GROUP BY level`,
    SAMPLE_CODER,
  );
  const get = (l: number) => rows.find((r) => r.level === l)?.n ?? 0;
  return { firstHand: get(2), discussed: get(1), other: get(0) };
}
