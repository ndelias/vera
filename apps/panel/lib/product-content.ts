// Copy for the product page. Draft in Nahuel's voice, for him to edit.
// Agents, surfaces and milestones follow BUILD-PLAN.md.

export type Status = "done" | "next" | "planned";

export const AGENTS: { name: string; job: string; body: string; icon: string }[] = [
  {
    name: "Mapper",
    icon: "map",
    job: "What it touches",
    body: "Reads the diff and the team's .vera.yml or CODEOWNERS, and groups the change into the areas people own. A second check asks whether a designer should see it. Separately, plain code looks for signs it's AI-written: an AI co-author in the commits, an agent's account, or a \"generated with\" line.",
  },
  {
    name: "Briefer",
    icon: "brief",
    job: "Where to look first",
    body: "Picks the 3 to 5 places that most need a person's judgment, each linked to its lines, with why and who should check it. On 105 real pull requests, its first three were the files reviewers commented on 71% of the time, against 64% for biggest files first. Next: a brief for designers, from screenshots.",
  },
  {
    name: "Examiner",
    icon: "examine",
    job: "Did the reviewer understand it?",
    body: "When a change is likely AI-written or has a high-risk place, it asks the engineer one to three questions, then grades the answers they give with their sign-off. The result shows next to the sign-off; it never blocks the merge. I rated 29 of 36 of its questions good on real pull requests.",
  },
  {
    name: "Sign-off",
    icon: "signoff",
    job: "Everyone at once",
    body: "Rules, not a model: the people .vera.yml names for the areas a change touches are asked, all at once. Approving, or commenting /vera sign-off, signs off, and a check shows who's left. With the Slack app, each person also gets their part as a message, kept current. Next: signing off from Slack.",
  },
];

export const SURFACES: { name: string; status: Status; body: string }[] = [
  {
    name: "GitHub Action",
    status: "done",
    body: "Runs in your CI on your own Anthropic key, about 2 to 4 cents a review. Posts one comment per pull request, keeps the sign-off check current, and grades answers. No server.",
  },
  {
    name: "CLI",
    status: "done",
    body: "vera review <pull request URL>, with your own key, on any public GitHub pull request. Prints the review without posting anything.",
  },
  {
    name: "Run viewer",
    status: "planned",
    body: "Real runs on public pull requests, replayed step by step: each agent's reasoning, tool calls, time and cost. No install. For now, the demo plays a scripted run.",
  },
  {
    name: "Slack",
    status: "done",
    body: "Optional, on your own Slack app and a small server you deploy (v0.7.0): each person gets their part as a direct message, kept current, and can ask Vera about the change. Signing off from Slack comes next.",
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
    status: "done",
    body: "Datasets from GitLab's history and a rules-only baseline: the number the agents have to beat.",
  },
  {
    id: "M2",
    title: "The agents, from the CLI",
    status: "done",
    body: "The agents on any public pull request, each scored on the Evals page before it shipped. Two didn't pass and stay out: a judge of fix-ups, and questions for designers without screenshots.",
  },
  {
    id: "M4",
    title: "GitHub Action, and checks for engineers",
    status: "done",
    body: "Installable from a tagged release (v0.5.0): the comment, the sign-off check and questions for engineers, running on Vera's repo and my portfolio.",
  },
  {
    id: "M6",
    title: "Slack",
    status: "next",
    body: "Live on a demo workspace (v0.7.0): each person's part as a message, and answers about the change from its diff. Next: answering the questions and signing off from Slack.",
  },
  {
    id: "M4",
    title: "Questions for designers",
    status: "planned",
    body: "Screenshots of the change from preview deployments, so the Briefer and the Examiner can work for designers too.",
  },
  {
    id: "M3",
    title: "Run viewer",
    status: "planned",
    body: "Recorded runs on real pull requests, replayed here.",
  },
  {
    id: "M5",
    title: "Demo company",
    status: "planned",
    body: "Seeded roles and realistic AI-written changes, measured against the targets in the case.",
  },
];
