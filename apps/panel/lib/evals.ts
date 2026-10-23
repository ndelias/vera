import { all } from "./db";

// Study 05 (M1): eval scores from research/pipeline/evals.py. Scores only;
// nothing per merge request is in the snapshot.

export type Score = {
  system: string;
  task: string;
  metric: string;
  subset: string;
  value: number | null;
  lo: number | null;
  hi: number | null;
  n: number;
};

export const SYSTEM_LABEL: Record<string, string> = {
  B0: "Majority",
  B1: "Path lookup",
  "B1-ask": "Path lookup, asks the lead",
  B2: "Hand rules",
};

export const ROLE_LABEL: Record<string, string> = {
  design: "Design",
  product: "Product",
  docs: "Docs",
};

export function scores(): Score[] {
  try {
    return all<Score>("SELECT system, task, metric, subset, value, lo, hi, n FROM ev_scores");
  } catch {
    return []; // an older snapshot without the evals
  }
}

/** One score, or undefined. */
export const find = (s: Score[], system: string, task: string, metric: string, subset: string) =>
  s.find((x) => x.system === system && x.task === task && x.metric === metric && x.subset === subset);

export const pctOf = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : `${Math.round(v * 100)}%`;
