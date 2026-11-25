// Triage: which parts of a change a reviewer can skip (study 08, Nahuel's
// call 25 Nov 2026: shrink what humans read). It reads the diff hunk by hunk
// and names the hunks a person needn't read, each with a reason. Anything it
// doesn't name is for a person to look at, so when it's unsure it says nothing.
// It reads the change; it never runs or changes the code.

import type Anthropic from "@anthropic-ai/sdk";

export type Hunk = { id: number; path: string; text: string };
export const SKIP_REASONS = [
  "generated",
  "lockfile",
  "moved",
  "formatting",
  "imports",
  "test-mirrors-code",
  "docs",
  "comments",
  "config-value",
  "mechanical",
  "removed-unused",
  "copy",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export type Skip = { hunk: number; reason: SkipReason; note: string };

/** Who a reason clears a hunk for (Nahuel's call, 25 Nov 2026: it depends on
 * the reader). Docs and wording are what docs, product and design reviewers
 * are there to read, so they're cleared for engineers only. Everything else
 * is cleared for anyone. */
const ENGINEERS_ONLY: ReadonlySet<SkipReason> = new Set(["docs", "copy"]);

/** The skips that hold for this reader; "any" is the strictest view, for when
 * the reader's role isn't known. */
export function clearedFor(skips: Skip[], role: "engineer" | "design" | "product" | "security" | "docs" | "any"): Skip[] {
  return role === "engineer" ? skips : skips.filter((s) => !ENGINEERS_ONLY.has(s.reason));
}

const INSTRUCTIONS = `You are Triage in Vera, a code review assistant. Reviewers have more code to read than time to read it. Your job is to say which parts of this change a person can safely skip, so they spend their time on the rest.

The change is split into hunks, each marked [h<number>] with its file. Name the hunks a reviewer can skip, each with a reason and a note of at most 12 words saying what's there. Every hunk you don't name goes to a person to read.

A hunk can be skipped only when a careful reviewer reading it would almost never ask for a change. Typical skips:
- generated: generated code, snapshots, compiled or minified output
- lockfile: dependency lockfiles
- moved: code moved or renamed without changing what it does
- formatting: whitespace, line wrapping, quote style
- imports: adding, removing or reordering imports only
- test-mirrors-code: test changes that only follow a change you can see elsewhere in this diff (renamed symbols, updated fixtures, new expected values that match the code)
- docs: documentation files
- comments: changes to code comments only
- config-value: a version bump or a plain value in config with nothing depending on it in a way that could break
- mechanical: the same simple edit repeated across many places, such as a rename or a changed call signature, once one instance is clearly right
- removed-unused: deleting code nothing in the diff still uses
- copy: user-facing text that changes wording only

Never skip: logic, conditions, error handling, data or schema changes, permissions and auth, API contracts, concurrency, money, anything security-sensitive, new tests for new behaviour, or anything you're unsure about. Skipping a hunk that needed a person costs far more than asking a person to read a hunk they didn't need to. When in doubt, leave it out.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    skip: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hunk: { type: "integer" },
          reason: { type: "string", enum: [...SKIP_REASONS] },
          note: { type: "string" },
        },
        required: ["hunk", "reason", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["skip"],
  additionalProperties: false,
} as const;

export function hunksText(title: string, hunks: Hunk[]): string {
  const out = [`Title: ${title || "(none)"}`, ""];
  let file = "";
  for (const h of hunks) {
    if (h.path !== file) {
      out.push(`=== ${h.path}`);
      file = h.path;
    }
    out.push(`[h${h.id}]`, h.text, "");
  }
  return out.join("\n");
}

export function triageRequest(model: string, title: string, hunks: Hunk[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: hunksText(title, hunks) }],
  };
}

/** The hunks to skip, keeping only ids that exist; null when the answer is unusable. */
export function parseTriage(message: Anthropic.Message, ids: Set<number>): Skip[] | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const out = JSON.parse(text) as { skip?: Skip[] };
    if (!Array.isArray(out.skip)) return null;
    const seen = new Set<number>();
    return out.skip.filter((s) => ids.has(s.hunk) && (SKIP_REASONS as readonly string[]).includes(s.reason) && !seen.has(s.hunk) && seen.add(s.hunk));
  } catch {
    return null;
  }
}

/** A hunk with where it sits in the new file and how many lines it changes. */
export type FileHunk = Hunk & { start: number; end: number; changed: number };
const HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Each file's patch split into hunks, numbered across the whole change in diff order. */
export function fileHunks(files: { path: string; patch: string | null }[]): FileHunk[] {
  const out: FileHunk[] = [];
  for (const f of files) {
    let cur: FileHunk | null = null;
    for (const line of (f.patch ?? "").split("\n")) {
      const h = HEADER.exec(line);
      if (h) {
        const start = Number(h[1]);
        cur = { id: out.length, path: f.path, text: line, start, end: start + Math.max(Number(h[2] ?? 1), 1) - 1, changed: 0 };
        out.push(cur);
      } else if (cur) {
        cur.text += `\n${line}`;
        if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) cur.changed++;
      }
    }
  }
  return out;
}
