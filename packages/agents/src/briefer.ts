// The Briefer: for one reviewer's role, the 3-5 places in a change that need
// a person's judgment, ordered by risk, each pointing at files and lines.
// It reads the change; it never runs or changes the code.

import type Anthropic from "@anthropic-ai/sdk";
import { changeText, type Change } from "./mapper.ts";

export type BriefRole = "engineer" | "design" | "product" | "security";
export type Place = { file: string; lines: string; what: string; why: string; risk: "high" | "medium" | "low" };
export type Brief = { summary: string; places: Place[] };

const FOCUS: Record<BriefRole, string> = {
  engineer: "code paths: logic that could be wrong, edge cases, data and state changes, error handling, concurrency, and anything other code depends on",
  design: "what people will see and do: new or changed screens, states (loading, empty, error), wording, layout, and flows",
  product: "how the product behaves differently for users: what they can now do or no longer do, defaults, limits, and who is affected",
  security: "how data and permissions flow: who can see or do what, input handling, secrets, and anything that crosses a trust boundary",
};

const instructions = (role: BriefRole, version: BrieferVersion) => `You are the Briefer in Vera, a code review assistant. You write the brief for one reviewer, whose role is: ${role}. They will read the change themselves; your job is to tell them where to look first.

Name the 3 to 5 places in this change that most need a person's judgment, for this role, ordered by risk (highest first). For a ${role}, focus on ${FOCUS[role]}. Skip what a person needn't check: generated files, renames, formatting, and tests that only mirror the code (unless the tests are what's risky).

${LENGTH[version]} Only claim what the diff shows.`;

// v2 (28 Oct 2026) only shortens the text: v1's "why" ran to a paragraph,
// too long to scan in a PR comment. Where it points is meant to stay the same.
const LENGTH = {
  v1: "For each place, give the file path exactly as the change lists it, the line range in the new version of the file (read it from the diff's @@ headers), what is there in a few words, why it needs judgment, and a risk (high, medium or low). Start with a one-sentence summary of the change for this reviewer.",
  v2: "For each place, give the file path exactly as the change lists it, the line range in the new version of the file (read it from the diff's @@ headers), what is there in at most 8 words, why it needs judgment in one plain sentence of at most 20 words (the risk itself, not what to check), and a risk (high, medium or low). Start with a one-sentence summary of the change for this reviewer, at most 20 words. Reviewers skim this: short and specific beats complete.",
} as const;
export type BrieferVersion = keyof typeof LENGTH;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          lines: { type: "string" },
          what: { type: "string" },
          why: { type: "string" },
          risk: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["file", "lines", "what", "why", "risk"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "places"],
  additionalProperties: false,
} as const;

export function briefRequest(model: string, c: Change, role: BriefRole, version: BrieferVersion = "v2"): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: instructions(role, version), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: changeText({ title: c.title, files: c.files }) }],
  };
}

export function parseBrief(message: Anthropic.Message): Brief | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const out = JSON.parse(text) as Brief;
    return Array.isArray(out.places) ? { summary: out.summary, places: out.places.slice(0, 5) } : null;
  } catch {
    return null;
  }
}
