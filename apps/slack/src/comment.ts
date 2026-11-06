// What the server reads from Vera's comment on a pull request: who was asked
// for which role, which Slack message went to whom, and the questions. The
// Action writes these (packages/cli); they're read again here because the
// server can only import files that import nothing from the workspace.
// test/sign-off.test.ts checks these read what the Action writes.

export type Ask = { who: string; role: string; action: string; why?: string };
export type Sent = Record<string, { channel: string; ts: string }>;
export type Exam = { questions: string[]; at: string };

function marker<T>(name: string, body: string): T | null {
  const m = new RegExp(`<!-- ${name}:([A-Za-z0-9+/=]*) -->`).exec(body);
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const readPlan = (body: string): Ask[] => {
  const v = marker<unknown>("vera-plan", body);
  return Array.isArray(v) ? (v as Ask[]) : [];
};
export const readSent = (body: string): Sent => marker<Sent>("vera-slack", body) ?? {};
export const readExam = (body: string): Exam | null => {
  const v = marker<Exam>("vera-exam", body);
  return v && Array.isArray(v.questions) ? { questions: v.questions, at: v.at } : null;
};

/** Whose message this is: the person Vera sent this exact message to, in this direct message. */
export function recipient(sent: Sent, channel: string, ts: string): string | null {
  return Object.entries(sent).find(([, m]) => m.channel === channel && m.ts === ts)?.[0] ?? null;
}
