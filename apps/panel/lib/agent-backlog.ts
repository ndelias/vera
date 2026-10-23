import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Study 07 (research/findings/11-agent-backlog.md): coding agents' pull
// requests on public GitHub. Counts and shares only.

type Shares = { n: number; merged: number; closed: number; open: number };
type Share = { share: number | null; ci95: [number, number] | null };

export type AgentBacklog = {
  sampled_prs: number;
  repos: number;
  active_repos: number;
  per_agent: Record<string, { all?: Shares; active?: Shares }>;
  D1: { all: Share & { open: number; n: number }; active: Share & { open: number; n: number }; verdict: string };
  D2: { repos_all: number; repos_active: number; largest_active: number[]; verdict: string };
  D3: { all: Share & { conflicts: number; known: number }; active: Share & { conflicts: number; known: number; median_base_commits_ahead: number | null }; verdict: string };
};

export const AGENT_LABEL: Record<string, string> = {
  "claude[bot]": "Claude",
  "copilot-swe-agent[bot]": "GitHub Copilot agent",
  "cursor[bot]": "Cursor",
  "devin-ai-integration[bot]": "Devin",
  "google-labs-jules[bot]": "Jules",
};

export function agentBacklog(): AgentBacklog | null {
  const file = path.resolve(process.cwd(), "data/agent-backlog.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as AgentBacklog) : null;
}
