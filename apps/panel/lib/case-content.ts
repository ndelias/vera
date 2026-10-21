// Copy for the case page. Draft in Nahuel's voice, for him to edit.
// Competitor rows summarize research/studies/04-deep-dive/teardown.md.

export const PAINS: { code: string; label: string }[] = [
  { code: "ai-output-quality", label: "AI-written code needs cleaning up" },
  { code: "review-overload", label: "Code review is overloaded" },
  { code: "agent-supervision", label: "Supervising agents is hard" },
  { code: "code-comprehension", label: "Nobody understands the code" },
  { code: "approval-delays", label: "Approvals stall work" },
];

// The quotes on /why, picked by hand from the first-hand accounts in the
// coded sample. The text is the passage the coder marked, verbatim, read
// from the database; only the choice of post is mine.
export const QUOTES: { docId: string; code: string }[] = [
  { docId: "hn:44980839", code: "code-comprehension" },
  { docId: "hn:47882021", code: "review-overload" },
  { docId: "hn:47606071", code: "code-comprehension" },
  { docId: "hn:44746573", code: "ai-output-quality" },
  { docId: "hn:50119264", code: "review-overload" },
  { docId: "hn:49490406", code: "review-overload" },
  { docId: "hn:47392529", code: "code-comprehension" },
  { docId: "hn:47388229", code: "ai-output-quality" },
  { docId: "hn:47224764", code: "review-overload" },
  { docId: "hn:47854838", code: "approval-delays" },
];

export type Persona = { role: string; who: string; body: string };

export const PERSONAS: Persona[] = [
  {
    role: "Feels it",
    who: "The reviewer",
    body: "Usually a senior engineer. Reads about twice the code per change that they did two years ago, in the same time.",
  },
  {
    role: "Owns it",
    who: "The engineering manager",
    body: "Answers for quality and delivery. Sees the review queue, the fix-ups after merge, and the senior engineers running out of attention.",
  },
  {
    role: "Pays for it",
    who: "The head of engineering",
    body: "Already pays $20–72 per developer a month for review tools. Vera sits in that budget, as the layer above the bots.",
  },
  {
    role: "Signs off",
    who: "Design, security, product",
    body: "Asked to approve changes in a tool they don't live in. On small changes, that's where most of the waiting happens.",
  },
];

export const FIRST_CUSTOMERS =
  "Teams of 10 to 200 engineers who've adopted coding agents, ship UI, and have design or security people who review changes. Sign-off across roles hurts them most.";

export type Cell = "yes" | "partly" | "no";
export type Competitor = { name: string; what: string; throughput: Cell; understanding: Cell; signoff: Cell; rework: Cell; price: string };

export const GAPS = [
  { key: "throughput", label: "Throughput" },
  { key: "understanding", label: "Understanding" },
  { key: "signoff", label: "Sign-off" },
  { key: "rework", label: "Rework" },
] as const;

export const COMPETITORS: Competitor[] = [
  { name: "CodeRabbit", what: "AI review comments, walkthroughs, auto-fix", throughput: "partly", understanding: "partly", signoff: "no", rework: "yes", price: "$24–72/user" },
  { name: "Graphite + Bugbot (Cursor)", what: "Stacked PRs, review inbox, merge queue, AI review", throughput: "yes", understanding: "no", signoff: "no", rework: "yes", price: "$20–40/user" },
  { name: "GitHub Copilot review", what: "AI review inside GitHub, agent fix PRs", throughput: "partly", understanding: "no", signoff: "no", rework: "yes", price: "bundled with Copilot" },
  { name: "Claude Code Review", what: "Verified, ranked findings; never approves", throughput: "partly", understanding: "no", signoff: "no", rework: "no", price: "token usage" },
  { name: "Aviator", what: "Reviewer routing, review time targets, spec approval", throughput: "yes", understanding: "partly", signoff: "partly", rework: "no", price: "$20–50/dev" },
  { name: "Slack Code", what: "Agents in Slack channels, previews", throughput: "no", understanding: "partly", signoff: "partly", rework: "yes", price: "in Slack plans" },
  { name: "Chromatic UI Review", what: "Visual diffs, design sign-off as a check", throughput: "no", understanding: "partly", signoff: "partly", rework: "no", price: "$179–399/mo" },
  { name: "LinearB gitStream", what: "Policy routing, auto-approve low risk", throughput: "yes", understanding: "no", signoff: "partly", rework: "no", price: "$29–59/user" },
];

export const VERA: Competitor = {
  name: "Vera",
  what: "Maps the change, checks understanding, coordinates every role's sign-off",
  throughput: "partly",
  understanding: "yes",
  signoff: "yes",
  rework: "no",
  price: "review-tool budget",
};

export const DIFFERENTIATORS: { title: string; body: string }[] = [
  {
    title: "It proves someone understood the change",
    body: "On risky changes, reviewers answer a couple of questions about it, or explain it in their own words. The answer is graded and recorded on the approval. Nothing on the market does this.",
  },
  {
    title: "Every role signs off, in parallel, on one record",
    body: "Rules in the repo decide who has to approve: design for UI, security for auth, product for behaviour. Vera asks them all at once, gives each what they need to judge, and keeps one record.",
  },
  {
    title: "It sits above the review bots",
    body: "Vera reads what CodeRabbit, Copilot or Claude Code Review found, and doesn't add another stream of comments. The bots look for problems; Vera makes sure a person made the call.",
  },
];

export type Tradeoff = { chose: string; over: string; why: string };

export const TRADEOFFS: Tradeoff[] = [
  {
    chose: "Record understanding by default; teams can turn it into a gate",
    over: "Blocking merges until a reviewer passes",
    why: "A mandatory quiz on every change becomes its own theater. Recording it keeps the friction low and still shows on the approval when nobody understood.",
  },
  {
    chose: "Read-only agents",
    over: "Agents that run code or push fixes",
    why: "Auto-fix is the most crowded part of the market, and running a pull request's code is a security risk. Vera's job is judgment, not edits.",
  },
  {
    chose: "Agents propose, code decides",
    over: "Letting a model decide who must sign off",
    why: "Who must approve and what blocks a merge have to be predictable and auditable. Those are rules in the repo, a check run, and an append-only record.",
  },
  {
    chose: "A layer above the review bots",
    over: "Another review bot",
    why: "First-pass AI review is close to commoditized. The unsolved part is underneath: understanding and sign-off.",
  },
  {
    chose: "Likely AI-written changes raise the stakes: the code owner, a second reviewer and the understanding check",
    over: "A slop score for every change",
    why: "AI-written code needing cleanup tied for the biggest pain, but rating code is what the review bots already do, and a score per author would be surveillance. Vera makes sure the right person looks, and says why.",
  },
  {
    chose: "Vera explains the change to each reviewer, from the code, with the lines it used",
    over: "An assistant that answers anything",
    why: "Understanding is the point, so Vera should help people get there, not just test them. But it won't give away the answers to an open check, and it says when something isn't in the code instead of guessing.",
  },
  {
    chose: "GitHub first",
    over: "GitLab first, where the evidence came from",
    why: "Most teams and review bots live on GitHub. The core doesn't depend on the platform, and the evals still run on GitLab's history.",
  },
  {
    chose: "Runnable without a server first (run viewer, CLI, GitHub Action), then Slack",
    over: "A hosted app from day one",
    why: "Weeks instead of about twice that, and no holding other people's code on my servers. Slack comes next, because that's where design and product sign off.",
  },
  {
    chose: "Team-level numbers only",
    over: "Individual understanding scores",
    why: "Ranking people by quiz results would turn Vera into surveillance, and that's one of the conditions that would kill it.",
  },
];

export const RULED_OUT: { idea: string; evidence: string }[] = [
  {
    idea: "My original idea: let non-engineers ship small changes (Blast Radius)",
    evidence: "It ranked last of 25 pains in the coded posts. At GitLab, non-engineers' small changes were approved faster than engineers' (0.59x). I dropped it.",
  },
  {
    idea: "Review is getting slower",
    evidence: "Time to merge stayed flat over two years while volume rose 55%. The cost of AI code is attention, not speed.",
  },
  {
    idea: "AI-assisted changes take longer to merge",
    evidence: "They don't: the medians are within 7% at every size. They do draw more review comments.",
  },
  {
    idea: "Approval delays as the headline",
    evidence: "Only 1–3% of posts mention them, even though they measurably slow small changes 2.2x. So they're part of the product, not the pitch.",
  },
];

export const KILL_CRITERIA = [
  "Reviewers skip or game the checks (opt-out above 30% after two weeks).",
  "Routing can't reach 70% on GitLab's historical merge requests.",
  "Teams see it as surveillance.",
];
