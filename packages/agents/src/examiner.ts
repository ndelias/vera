// The Examiner: on risky changes, 1-3 short questions that only someone who
// read the change could answer, each with what a good answer covers and the
// lines it rests on; and a grader that checks a reviewer's answer. By
// default this records whether understanding was shown; it doesn't block.

import type Anthropic from "@anthropic-ai/sdk";
import { changeText, type Change } from "./mapper.ts";
import type { BriefRole } from "./briefer.ts";

export type Question = { question: string; good_answer: string; cites: string[] };
export type Exam = { questions: Question[] };
export type Grade = { pass: boolean; reason: string };

const questionsInstructions = (role: BriefRole) => `You are the Examiner in Vera, a code review assistant. A reviewer whose role is ${role} is about to approve this change. Write 1 to 3 short questions that check they understood it.

Good questions:
- can be answered from the change itself, without running anything;
- would be easy for someone who read the change and hard for someone who only read the title;
- are about what matters for a ${role}, in plain words a ${role} would use (no code jargon for design or product);
- have one clear answer, and can be answered in a sentence or two.

Don't ask about trivia (variable names, line counts), or what isn't in the change. For each question, give what a good answer covers, and the files and lines it rests on (as "path:start-end").`;

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          good_answer: { type: "string" },
          cites: { type: "array", items: { type: "string" } },
        },
        required: ["question", "good_answer", "cites"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export function examRequest(model: string, c: Change, role: BriefRole): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: QUESTIONS_SCHEMA } },
    system: [{ type: "text", text: questionsInstructions(role), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: changeText({ title: c.title, files: c.files }) }],
  };
}

const GRADER = `You grade one answer to a question about a code change, for Vera, a code review assistant. You get the question, what a good answer covers, and the reviewer's answer.

Pass the answer when it shows the reviewer understood the point the good answer covers, in their own words; wording, length and small omissions don't matter. Fail it when it's wrong, vague enough that someone who only read the title could have written it, or misses the point. Give one short reason.`;

const GRADE_SCHEMA = {
  type: "object",
  properties: { pass: { type: "boolean" }, reason: { type: "string" } },
  required: ["pass", "reason"],
  additionalProperties: false,
} as const;

export function gradeRequest(model: string, q: Question, answer: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: GRADE_SCHEMA } },
    system: [{ type: "text", text: GRADER, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${q.question}\n\nA good answer covers: ${q.good_answer}\n\nThe reviewer's answer: ${answer}` }],
  };
}

/** For testing the grader: three answers of known quality, written by a separate call. */
const ANSWERS = `You help test a grader. Given a question about a code change and what a good answer covers, write three answers a reviewer might give:
- good: correct and complete, in a reviewer's own words (not a copy of the key);
- vague: plausible-sounding but generic, the kind someone who only read the title could write;
- wrong: confident and specific, but wrong about the point.
Each one or two sentences.`;

const ANSWERS_SCHEMA = {
  type: "object",
  properties: { good: { type: "string" }, vague: { type: "string" }, wrong: { type: "string" } },
  required: ["good", "vague", "wrong"],
  additionalProperties: false,
} as const;

export function answersRequest(model: string, q: Question): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ANSWERS_SCHEMA } },
    system: [{ type: "text", text: ANSWERS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${q.question}\n\nA good answer covers: ${q.good_answer}` }],
  };
}

export function parseJson<T>(message: Anthropic.Message): T | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
