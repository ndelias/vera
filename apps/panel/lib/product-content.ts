// Copy for the product page. Draft in Nahuel's voice, for him to edit.
// Agents, surfaces and milestones follow BUILD-PLAN.md.

export type Status = "done" | "next" | "planned";

export const AGENTS: { name: string; job: string; body: string; icon: string }[] = [
  {
    name: "Mapper",
    icon: "map",
    job: "What it touches, and how risky it is",
    body: "Reads the diff, the files around it, code owners and what the review bots already found, and groups the change into areas. It also spots likely AI-written code nobody has checked: new logic with no tests, duplicated blocks, bot findings still open.",
  },
  {
    name: "Briefer",
    icon: "brief",
    job: "One brief per role",
    body: "Design gets the preview and the screens that changed. Security gets the data flow. Each person sees what they need to judge, not the whole diff.",
  },
  {
    name: "Examiner",
    icon: "examine",
    job: "Did the reviewer understand it?",
    body: "On risky changes, asks the reviewer one to three questions about the change and grades the answer. The result goes on the approval.",
  },
  {
    name: "Sign-off",
    icon: "signoff",
    job: "Everyone at once",
    body: "Asks every role the rules name in parallel, chases the ones still waiting, and keeps one record of who approved what. Likely AI-written changes also go to the owner of the code they touch, and to a second reviewer when the rules say so, with the reason attached.",
  },
];

export const SURFACES: { name: string; status: Status; body: string }[] = [
  {
    name: "Run viewer",
    status: "planned",
    body: "Real runs on public pull requests, replayed step by step: each agent's reasoning, tool calls, time and cost. No install.",
  },
  {
    name: "CLI",
    status: "planned",
    body: "vera review <pull request URL>, with your own API key, on any public GitHub pull request.",
  },
  {
    name: "GitHub Action",
    status: "planned",
    body: "Runs in your CI. Posts the comment, creates the sign-off check and records approvals. No server.",
  },
  {
    name: "Slack",
    status: "planned",
    body: "Later, on a demo workspace: @vera asks design, security and product to sign off in parallel, and answers questions about the change.",
  },
];

export const MILESTONES: { id: string; title: string; status: Status; body: string }[] = [
  {
    id: "R",
    title: "Research",
    status: "done",
    body: "Six rounds of research on public data, each planned and committed before its data was pulled, picked the problem. This site shows all of it.",
  },
  {
    id: "M0",
    title: "Foundations",
    status: "done",
    body: "Workspace, CI, secrets handling and the trace format every run writes.",
  },
  {
    id: "M1",
    title: "Evals before agents",
    status: "next",
    body: "Datasets from GitLab's history and a rules-only baseline: the number the agents have to beat.",
  },
  {
    id: "M2",
    title: "The agents, from the CLI",
    status: "planned",
    body: "The coordinator and the four agents on any public pull request, scored against the evals, including whether the likely-AI signals predict fix-ups better than size alone.",
  },
  {
    id: "M3",
    title: "Run viewer",
    status: "planned",
    body: "Recorded runs on real pull requests, replayed here.",
  },
  {
    id: "M4",
    title: "GitHub Action and understanding checks",
    status: "planned",
    body: "The comment, the sign-off check and the reviewer questions, running end to end on my own repo.",
  },
  {
    id: "M5",
    title: "Demo company",
    status: "planned",
    body: "Seeded roles and realistic AI-written changes, measured against the targets in the case.",
  },
  {
    id: "M6",
    title: "Slack",
    status: "planned",
    body: "Cross-role sign-off from Slack on a demo workspace.",
  },
];
