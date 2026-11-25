// The Guide: the whole pull request as a walkthrough (Nahuel's call, 25 Nov
// 2026). Reviewers still look at nearly everything, so instead of a list of
// files, the Guide groups every change into a few steps by what it does, puts
// them in the order to read them, and explains each in a sentence or two.
//
// It only groups, orders and explains. How much care a step needs comes from
// the agents that were measured (study 08): a step holding one of the
// Briefer's places is Verify, one Triage cleared entirely is Cleared, the
// rest is Skim. It reads the change; it never runs or changes the code.

import type Anthropic from "@anthropic-ai/sdk";
import { hunksText, type Hunk } from "./triage.ts";

export type Step = { title: string; explain: string; hunks: number[] };

const INSTRUCTIONS = `You are the Guide in Vera, a code review assistant. A reviewer is about to read this pull request. Turn it into a short walkthrough they can follow from start to finish, so they understand every part of it without getting lost.

The change is split into hunks, each marked [h<number>] with its file. Group the hunks into steps by what they do together, not by file: one step can span several files, and one file can be split across steps. Most pull requests need 2 to 6 steps; a tiny one can be a single step. Put every hunk in exactly one step.

Order the steps the way a reviewer should read them: the core change first, then what builds on it or calls it, then tests, then configuration, generated files and docs.

For each step:
- "title": what it does, starting with a verb, at most 8 words ("Applies the coupon at checkout").
- "explain": one or two plain sentences, at most 40 words: what this part does and how it connects to the rest. Say what changes in behaviour, not which lines moved. Only claim what the diff shows.
- "hunks": the hunk numbers in it.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, explain: { type: "string" }, hunks: { type: "array", items: { type: "integer" } } },
        required: ["title", "explain", "hunks"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
} as const;

export function guideRequest(model: string, title: string, hunks: Hunk[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: hunksText(title, hunks) }],
  };
}

/** The steps, with every hunk in exactly one: unknown numbers dropped, a hunk named twice kept in its
 * first step, and any left out gathered in a last step so nothing goes unlisted. Null when unusable. */
export function parseGuide(message: Anthropic.Message, ids: number[]): Step[] | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  let raw: { steps?: Step[] };
  try {
    raw = text ? (JSON.parse(text) as { steps?: Step[] }) : {};
  } catch {
    return null;
  }
  if (!Array.isArray(raw.steps) || !raw.steps.length) return null;
  const known = new Set(ids);
  const seen = new Set<number>();
  const steps = raw.steps
    .map((s) => ({
      title: String(s.title ?? "").trim(),
      explain: String(s.explain ?? "").trim(),
      hunks: (Array.isArray(s.hunks) ? s.hunks : []).filter((h) => known.has(h) && !seen.has(h) && (seen.add(h), true)),
    }))
    .filter((s) => s.hunks.length && s.title);
  const left = ids.filter((h) => !seen.has(h));
  if (left.length) steps.push({ title: "Other changes", explain: "Smaller changes the walkthrough didn't group with the steps above.", hunks: left });
  return steps.length ? steps : null;
}
