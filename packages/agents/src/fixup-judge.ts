// The fix-up judge: given a merged change and a later change that links it,
// does the later one fix or undo something the first got wrong? File overlap
// and links alone can't say (study 05: 16% and 12% real); this reads both.

import type Anthropic from "@anthropic-ai/sdk";

export type Side = { title: string; description: string; paths: string[]; diff?: string };
export type Verdict = { fixes: boolean; confidence: "high" | "medium" | "low"; reason: string };

/** Description characters and diff lines sent; past these, the rest is cut and the cut is said. */
const DESCRIPTION_CHARS = 4000;
const DIFF_LINES = 1500;

const INSTRUCTIONS = `You are part of Vera, a code review assistant. You get two merged changes (merge requests) from the same codebase. The second was merged within a week of the first and links to it.

Answer one question: does the second change fix or undo something the first one got wrong? Yes when it repairs a bug, error, regression or mistake the first introduced, corrects something the first got wrong, or reverts the first. No when it builds on the first as planned, finishes or extends the same work, copies the first to an older release (a backport), is a sibling or stacked change, or is related work that doesn't correct the first.

Read the second change's description and diff for what it actually changes and why. Give a confidence (high, medium or low) and one short reason.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    fixes: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: { type: "string" },
  },
  required: ["fixes", "confidence", "reason"],
  additionalProperties: false,
} as const;

function side(label: string, s: Side): string {
  const desc = s.description.length > DESCRIPTION_CHARS ? `${s.description.slice(0, DESCRIPTION_CHARS)}\n[description cut for length]` : s.description;
  const parts = [`# ${label}: ${s.title}`, `## Description\n${desc || "(none)"}`, `## Changed paths (${s.paths.length})\n${s.paths.join("\n")}`];
  if (s.diff !== undefined) {
    const lines = s.diff.split("\n");
    parts.push(`## Diff\n${lines.length > DIFF_LINES ? `${lines.slice(0, DIFF_LINES).join("\n")}\n[diff cut at ${DIFF_LINES} lines of ${lines.length}]` : s.diff}`);
  }
  return parts.join("\n\n");
}

export function judgeRequest(model: string, first: Side, second: Side): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${side("First change", first)}\n\n${side("Second change", second)}` }],
  };
}

export function parseVerdict(message: Anthropic.Message): Verdict | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const out = JSON.parse(text) as Verdict;
    return typeof out.fixes === "boolean" ? out : null;
  } catch {
    return null;
  }
}
