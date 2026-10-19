import { all, one } from "./db";
import type { Test } from "./data";

// Study 02 (GitLab work data). Analysis window starts 19 Oct 2024.
const WINDOW_START = Date.UTC(2024, 9, 19) / 1000;

export const ROLES = ["engineering", "design", "product", "marketing", "other", "unknown"] as const;

export const PROJECT_LABEL: Record<string, string> = {
  handbook: "Handbook",
  product: "Product (gitlab-org/gitlab)",
};

const HOUR = 3600;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type ProjectRole = {
  project: string;
  role: string;
  mrs: number;
  merged: number;
  medianHoursToMerge: number | null;
};

export function projectRoles(): ProjectRole[] {
  const rows = all<{ project: string; role: string; state: string; dur: number | null }>(
    `SELECT project, author_role AS role, state, merged_at - created_at AS dur
     FROM gl_mrs WHERE created_at >= ? AND author_role != 'bot'`,
    WINDOW_START,
  );
  const out: ProjectRole[] = [];
  for (const project of Object.keys(PROJECT_LABEL)) {
    for (const role of ROLES) {
      const mine = rows.filter((r) => r.project === project && r.role === role);
      if (!mine.length) continue;
      const merged = mine.filter((r) => r.state === "merged" && r.dur !== null && r.dur >= 0);
      const m = median(merged.map((r) => r.dur!));
      out.push({
        project,
        role,
        mrs: mine.length,
        merged: merged.length,
        medianHoursToMerge: m === null ? null : m / HOUR,
      });
    }
  }
  return out;
}

export type ApprovalWait = { role: string; n: number; medianHours: number | null };

/** Sampled merged MRs: hours from creation to first approval by someone else. */
export function approvalWaits(project: string, smallOnly = false): ApprovalWait[] {
  const rows = all<{ role: string; wait: number }>(
    `SELECT m.author_role AS role, d.first_review_at - m.created_at AS wait
     FROM gl_mrs m JOIN gl_mr_details d ON d.mr_id = m.id
     WHERE m.project = ? AND m.state = 'merged' AND m.created_at >= ?
       AND d.first_review_at IS NOT NULL AND d.first_review_at >= m.created_at
       ${smallOnly ? "AND d.files_changed IS NOT NULL AND d.files_changed <= 3" : ""}`,
    project,
    WINDOW_START,
  );
  return ROLES.map((role) => {
    const xs = rows.filter((r) => r.role === role).map((r) => r.wait);
    const m = median(xs);
    return { role, n: xs.length, medianHours: m === null ? null : m / HOUR };
  }).filter((r) => r.n > 0);
}

export function studyTotals() {
  return one<{ mrs: number; sampled: number; people: number }>(
    `SELECT (SELECT COUNT(*) FROM gl_mrs WHERE created_at >= ?) AS mrs,
            (SELECT COUNT(*) FROM gl_mr_details) AS sampled,
            (SELECT COUNT(*) FROM gl_people) AS people`,
    WINDOW_START,
  )!;
}

export function studyTests(): (Test & { statement: string; disproved_if: string; status: string })[] {
  return all(
    `SELECT t.*, h.statement, h.disproved_if, h.status FROM tests t
     JOIN hypotheses h ON h.id = t.hypothesis_id AND h.version = t.hypothesis_version
     WHERE t.hypothesis_id IN ('G1', 'G2', 'G3')
       AND t.id = (SELECT MAX(id) FROM tests t2 WHERE t2.hypothesis_id = t.hypothesis_id)
     ORDER BY t.hypothesis_id`,
  );
}
