// Study 09: the accuracy checker. A stronger model reads one walkthrough step's
// explanation beside that step's code, lists every claim the explanation makes,
// and checks each one against the code. A step is accurate only when every
// claim holds. Results are reported as "checked by a model", never as a human
// rating (Nahuel's call, 27 Nov 2026).

import type Anthropic from "@anthropic-ai/sdk";

export type Line = { t: " " | "+" | "-"; text: string; old: number | null; new: number | null };
export type Verdict = { claims: { claim: string; holds: "yes" | "no" | "not shown"; why: string }[]; accurate: boolean };

const INSTRUCTIONS = `You check explanations of code changes for accuracy. A code review tool wrote a short explanation of one part of a pull request, and reviewers will trust it. Your job is to find anything in it that isn't true of the code shown.

List every factual claim the explanation makes about the code: what it does, what changed, what callers or users will see, what can fail, how it connects to other parts. For each claim, decide:
- "yes": the code shown supports it.
- "no": the code shown contradicts it, or it's wider than the code (an "only", "every" or "never" the code doesn't bear out, the wrong verb for what happens, a case the code doesn't handle).
- "not shown": it depends on code outside what's shown, and nothing shown contradicts it.

Judge the explanation as a reviewer would read it: plain wording that's true in substance holds; don't fail it for leaving things out (completeness is judged separately) or for word choice that doesn't change the meaning. "accurate" is true only if no claim is "no". Give a short "why" for each claim.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: { claim: { type: "string" }, holds: { type: "string", enum: ["yes", "no", "not shown"] }, why: { type: "string" } },
        required: ["claim", "holds", "why"],
        additionalProperties: false,
      },
    },
    accurate: { type: "boolean" },
  },
  required: ["claims", "accurate"],
  additionalProperties: false,
} as const;

export function judgeRequest(model: string, step: { title: string; explain: string; hunks: { path: string; lines: Line[] }[] }): Anthropic.MessageCreateParamsNonStreaming {
  const code = step.hunks.map((h) => [`=== ${h.path}`, ...h.lines.map((l) => `${String(l.new ?? l.old ?? "").padStart(5)} ${l.t} ${l.text}`)].join("\n")).join("\n\n");
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "high", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Step: ${step.title}\nExplanation: ${step.explain}\n\nThe code for this step (line number, + added, - removed):\n\n${code.slice(0, 60000)}` }],
  };
}
