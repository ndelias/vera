// The visibility check: does a change alter what people using the product see
// or do? File types can't tell (a .vue file can be a pure refactor; a Ruby
// change can add a button), so this reads the change itself. Routing uses the
// answer to decide whether design is asked.

import type Anthropic from "@anthropic-ai/sdk";
import { changeText, type Change } from "./mapper.ts";

export type Visibility = { visible: boolean; confidence: "high" | "medium" | "low"; what: string };

// Each version is kept as it ran, so every score can be reproduced.
const INSTRUCTIONS = {
  v1: `You are part of Vera, a code review assistant. For one change (a merge request), answer one question: does it change what people using the product see or do?

Yes when anything a user could notice changes: a screen, layout, spacing or style; wording on screen, including messages, tooltips and labels; a new or removed button, field, page, step or state (loading, empty, error); or how something behaves when people use it.

No when nothing a user could notice changes: tests, tooling, build or CI setup, code style fixes, refactors and file moves that keep behaviour the same, backend work with no visible effect, documentation for engineers, or code behind a switch that is off for everyone.

Give a confidence: high when the diff shows it plainly; medium when it likely does but you're inferring; low when you can't tell. Then one short line naming what a user would notice, or "Nothing visible".`,
  // v2, tuned on half of Nahuel's labels: the question is whether a design
  // decision is being made, not whether a user could notice anything.
  v2: `You are part of Vera, a code review assistant. For one change (a merge request), answer one question: does it make a design decision a product designer should see before it ships?

Yes when the change decides how the product looks, reads or flows: a new screen, section, table, column, drawer, dialog or chart; a new state such as empty, loading or placeholder; new or changed wording or labels people read; a change to how something is formatted on screen; a change to what a control does or where people land; a redesign; or moving where something lives in navigation.

No when the change makes no new design decision, even if a user might notice an effect: a bug fix that makes something work as it was meant to; who is allowed to see or do something (permissions); timing or behaviour behind the scenes (messages arriving later, data loading faster or more completely); moving a page onto a shared layout or aligning it with others that already exist; correcting technical text such as commands; hiding something that shouldn't have shown; tests, tooling, code style, refactors, backend work, documentation for engineers, or code behind a switch that is off for everyone.

Give a confidence: high when the diff shows it plainly; medium when you're inferring; low when you can't tell. Then one short line naming the design decision, or "No design decision".`,
} as const;

export type VisibilityVersion = keyof typeof INSTRUCTIONS;

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    visible: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    what: { type: "string" },
  },
  required: ["visible", "confidence", "what"],
  additionalProperties: false,
} as const;

export function visibilityRequest(model: string, c: Change, version: VisibilityVersion = "v1"): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS[version], cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: changeText({ title: c.title, files: c.files }) }],
  };
}

export function parseVisibility(message: Anthropic.Message): Visibility | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const out = JSON.parse(text) as Visibility;
    return typeof out.visible === "boolean" ? out : null;
  } catch {
    return null;
  }
}
