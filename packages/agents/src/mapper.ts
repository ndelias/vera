// The Mapper: given a change, which teams own what it touches. It reads the
// change (title, changed paths, the diff) and the team directory, the areas
// each team has declared. It proposes; routing code decides who is asked.

import type Anthropic from "@anthropic-ai/sdk";

export type Team = {
  key: string;
  name: string;
  stage: string;
  section: string | null;
  focus: string;
  categories: string[];
  roles: string[];
};

export type Directory = { as_of: string; teams: Team[] };

export type ChangedFile = { path: string; diff: string; generated: boolean; tooLarge: boolean };

/** Past owners of the folders a change touches (the ownership skill): each
 * team's share of earlier changes there. Evidence, not the answer. */
export type Ownership = { team: string; share: number }[];

export type Change = { title: string; files: ChangedFile[]; ownership?: Ownership };

export type MapperTeam = { team: string; confidence: "high" | "medium" | "low"; reason: string };
export type MapperOutput = { teams: MapperTeam[] };

/** Diff lines sent in full; past this, files are listed with their size only. */
export const DIFF_LINE_BUDGET = 2000;

// Each version is kept as it ran, so every score can be reproduced.
const INSTRUCTIONS = {
  v1: `You are the Mapper in Vera, a code review assistant. For one change (a merge request), you name the teams that own the product areas it touches, so the right people are asked to review it.

You get the team directory (each team's product areas, focus, and which review roles it has) and the change: its title, its changed paths, and its diff.

Rank up to three teams, most likely owner first. Use team names exactly as the directory writes them. For each, give a confidence (high, medium or low) and one short reason that points at the paths or code that show it. If the change is shared plumbing with no clear owner, still name the most likely team and say low.`,
  // v2: adds ownership history (the ownership skill) and a stricter meaning for "high".
  v2: `You are the Mapper in Vera, a code review assistant. For one change (a merge request), you name the teams that own the product areas it touches, so the right people are asked to review it.

You get the team directory (each team's product areas, focus, and which review roles it has) and the change: its title, its changed paths, and its diff.

You may also get ownership history: each team's share of past changes to the same folders. Treat it as evidence, not the answer. Folders are shared, and teams get renamed or split, so history can use old names; always answer with the directory's names, and weigh history against what the change actually does.

Rank up to three teams, most likely owner first. Use team names exactly as the directory writes them. For each, give a confidence: high only when the code, the directory's areas and any history all point to that team; medium when most of it does; low otherwise. Give one short reason that points at the paths or code that show it. If the change is shared plumbing with no clear owner, still name the most likely team and say low.`,
} as const;

export type MapperVersion = keyof typeof INSTRUCTIONS;

export function directoryText(d: Directory): string {
  const lines = d.teams.map((t) => {
    const areas = t.categories.length ? t.categories.join(", ") : "none listed";
    const roles = t.roles.length ? t.roles.join(", ") : "none listed";
    return `- ${t.name} (stage ${t.stage}${t.section ? `, section ${t.section}` : ""}). Areas: ${areas}.${t.focus ? ` Focus: ${t.focus}.` : ""} Review roles: ${roles}.`;
  });
  return `# Team directory, as of ${d.as_of}\n\n${lines.join("\n")}`;
}

export function changeText(c: Change): string {
  let budget = DIFF_LINE_BUDGET;
  const parts: string[] = [];
  const listed: string[] = [];
  for (const f of c.files) {
    const lines = f.diff ? f.diff.split("\n") : [];
    if (f.generated || f.tooLarge || !lines.length) {
      listed.push(`${f.path} (${f.generated ? "generated" : f.tooLarge ? "too large to show" : "no text diff"})`);
    } else if (lines.length <= budget) {
      parts.push(`--- ${f.path}\n${f.diff}`);
      budget -= lines.length;
    } else {
      listed.push(`${f.path} (${lines.length} diff lines, not shown: over the size limit)`);
    }
  }
  const history = c.ownership?.length
    ? `## Ownership history (share of past changes to these folders)\n${c.ownership.map((o) => `${o.team}: ${Math.round(o.share * 100)}%`).join("\n")}`
    : c.ownership
      ? "## Ownership history\nNo past changes to these folders."
      : "";
  return [
    `# Change: ${c.title}`,
    `## Changed paths (${c.files.length})\n${c.files.map((f) => f.path).join("\n")}`,
    history,
    listed.length ? `## Listed without their diff\n${listed.join("\n")}` : "",
    parts.length ? `## Diff\n${parts.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          team: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
        required: ["team", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["teams"],
  additionalProperties: false,
} as const;

/** The request for one change. The instructions and directory come first and are cached. */
export function mapperRequest(model: string, d: Directory, c: Change, version: MapperVersion = "v1"): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [
      { type: "text", text: INSTRUCTIONS[version] },
      { type: "text", text: directoryText(d), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: changeText(c) }],
  };
}

/** The answer from a finished message, or null when there isn't a valid one. */
export function parseMapper(message: Anthropic.Message): MapperOutput | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  try {
    const out = JSON.parse(text) as MapperOutput;
    return Array.isArray(out.teams) ? { teams: out.teams.slice(0, 3) } : null;
  } catch {
    return null;
  }
}
