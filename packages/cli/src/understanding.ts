// The understanding check (Nahuel's calls, 28 Oct 2026). On likely-AI or
// high-risk changes the Examiner writes 1-3 questions for the engineer, who
// answers them where they sign off: in the approval's text, or under
// `/vera sign-off`, numbered. Vera grades each answer and the sign-off table
// shows the result. It records understanding; it doesn't block.
//
// The questions travel in Vera's comment. What a good answer covers travels
// with them, encrypted with a key derived from the repo's Anthropic key, so
// anyone can read the comment's source but only Vera's own runs can read
// the answers. Grades are kept in the comment too, so no answer is graded twice.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Question } from "@vera/agents/examiner";
import { parseSignoff } from "@vera/rules";
import type { Comment, PullReview } from "@vera/tools/github";

export type StoredExam = { questions: string[]; at: string; why: string; keys: string };
export type Understanding = { questions: number; answered: number; passed: number; graded: boolean; reasons: string[] };

const EXAM = /<!-- vera-exam:([A-Za-z0-9+/=]*) -->/;
const GRADES = /<!-- vera-grades:([A-Za-z0-9+/=]*) -->/;
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const unb64 = <T>(s: string): T | null => {
  try {
    return JSON.parse(Buffer.from(s, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
};
const keyFrom = (secret: string) => createHash("sha256").update(`vera-exam:${secret}`).digest();

export function seal(text: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** null when the secret differs (say, the key was rotated) or the text was changed. */
export function open(sealed: string, secret: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64");
    const d = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function examMarker(questions: Question[], why: string, secret: string, at = new Date().toISOString()): string {
  const stored: StoredExam = { questions: questions.map((q) => q.question), at, why, keys: seal(JSON.stringify(questions.map((q) => q.good_answer)), secret) };
  return `<!-- vera-exam:${b64(stored)} -->`;
}

export function readExam(body: string): StoredExam | null {
  const m = EXAM.exec(body);
  return m ? unb64<StoredExam>(m[1]!) : null;
}

export type Grades = Record<string, { pass: boolean; reason: string }>;
export const gradesMarker = (grades: Grades) => `<!-- vera-grades:${b64(grades)} -->`;
export const readGrades = (body: string): Grades => {
  const m = GRADES.exec(body);
  return (m && unb64<Grades>(m[1]!)) || {};
};

/** Numbered answers ("1. ...", "2) ..."), each running until the next number. */
export function parseAnswers(body: string): Map<number, string> {
  const out = new Map<number, string>();
  let current: number | null = null;
  for (const line of body.split("\n")) {
    const m = /^\s*(\d)[.)]\s+(.*)$/.exec(line);
    if (m) {
      current = Number(m[1]);
      out.set(current, m[2]!.trim());
    } else if (current !== null && line.trim() && !/^\s*\/vera\b/.test(line)) {
      out.set(current, `${out.get(current)} ${line.trim()}`);
    }
  }
  return out;
}

/** The person's latest sign-off that carries answers, given after the questions were asked. */
export function latestAnswers(who: string, since: string, reviews: PullReview[], comments: Comment[], marker: string): { id: string; answers: Map<number, string> } | null {
  const me = (x: string) => x.toLowerCase() === who.replace(/^@/, "").toLowerCase();
  const found = [
    ...reviews.filter((r) => me(r.who) && r.state === "APPROVED" && r.at >= since).map((r) => ({ id: `r${r.id}`, at: r.at, body: r.body })),
    ...comments.filter((c) => me(c.who) && c.at >= since && !c.body.includes(marker) && parseSignoff(c.body)).map((c) => ({ id: `c${c.id}`, at: c.at, body: c.body })),
  ].map((x) => ({ ...x, answers: parseAnswers(x.body) })).filter((x) => x.answers.size).sort((a, b) => a.at.localeCompare(b.at));
  const last = found.at(-1);
  return last ? { id: last.id, answers: last.answers } : null;
}

/** "understood 2 of 3", "not answered", ...: what the sign-off table shows. */
export function describe(u: Understanding): string {
  if (!u.answered) return "questions not answered";
  if (!u.graded) return "answers not graded yet";
  return `understood ${u.passed} of ${u.questions}`;
}
