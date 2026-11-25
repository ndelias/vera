#!/usr/bin/env node
// vera review <pull request URL> [--config .vera.yml] [--markdown | --comment] [--model claude-sonnet-5-5] [--out .vera/runs]
//   --markdown prints the review as a GitHub comment; --comment posts it (or updates Vera's earlier
//   one) and the "Vera: sign-off" check.
// vera sign-off <pull request URL> [--comment-id <id>] [--model claude-sonnet-5-5]
//   Updates the sign-off check from the PR's approvals and `/vera sign-off` comments. Its only
//   model calls grade answers to the understanding check, once each (needs ANTHROPIC_API_KEY).
//
// review needs ANTHROPIC_API_KEY (your own key; a review costs about 2-4 cents).
// GITHUB_TOKEN is optional for reading and raises GitHub's limit from 60 requests an hour;
// posting the comment and the check needs one that can write to the repo.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secret, toJsonl, totals } from "@vera/core";
import { review, type Review } from "./review.ts";
import { briefOf, MARKER, toMarkdown, type Threads } from "./markdown.ts";
import { people, readBrief } from "./people.ts";
import { message, readSent, sendAll, withSent } from "./slack.ts";
import { CHECK, fromSlack, readPlan, status, statusBlock, toCheck, withStatus } from "./signoff.ts";
import { latestAnswers, open, readExam, readGrades, type Grades, type Understanding } from "./understanding.ts";
import { answers, newThreads, reuse, verdict, verifiedEvents } from "./threads.ts";
import { explainRequest, parseExplanation } from "@vera/agents/explainer";
import Anthropic from "@anthropic-ai/sdk";
import { gradeRequest, parseJson, type Grade } from "@vera/agents/examiner";
import { counts, parseSignoff, signoff, slackIds, type Signoff } from "@vera/rules";
import { client as github, parsePullUrl, type Comment, type LineComment, type PullRef, type PullReview } from "@vera/tools/github";

const USAGE = `Usage: vera review <GitHub pull request URL> [--config .vera.yml] [--markdown | --comment] [--model claude-sonnet-5-5] [--out .vera/runs]
       vera sign-off <GitHub pull request URL> [--comment-id <id>] [--model claude-sonnet-5-5]`;

function optional(name: string): string | undefined {
  try {
    return secret(name);
  } catch {
    return undefined;
  }
}

/** The GitHub App that posts sign-offs from Slack (the `slack-app` input). Not a secret. */
const SLACK_APP = process.env.SLACK_APP?.trim() || undefined;

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function print(r: Review, tracePath: string) {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const lines = [
    `Vera · ${r.pull.ref.owner}/${r.pull.ref.repo}#${r.pull.ref.number}: ${r.pull.title}`,
    `  ${r.pull.files.length} ${r.pull.files.length === 1 ? "file" : "files"}, +${add} -${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""}`,
    `  Owners from ${r.ownership.source === "none" ? "nothing declared" : `${r.ownership.source} (${r.ownership.areas.length} areas, ${r.ownership.people.length} people)`}`,
    ...(r.ownershipError ? [`  .vera.yml skipped: ${r.ownershipError}`] : []),
    "",
    "Touches",
    ...(!r.areas ? ["  (the Mapper gave no answer)"] : r.areas.teams.length ? r.areas.teams.flatMap((a) => [`  ${a.team} (${a.confidence})`, `      ${a.reason}`]) : ["  None of the declared areas fit this change."]),
    "",
    `Design decision: ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    "",
    "Where to look first (engineer)",
    ...(!r.brief ? ["  (the Briefer gave no answer)"] : [
      ...(r.brief.summary ? [`  ${r.brief.summary}`] : []),
      ...r.brief.places.flatMap((p, i) => [`  ${i + 1}. ${p.risk.padEnd(6)} ${p.file} ${p.lines}`, `      ${sentence(p.what)} ${p.why}`]),
    ]),
    "",
    ...(r.exam ? ["", `Understanding check (because ${r.exam.why})`, ...r.exam.questions.map((q, i) => `  ${i + 1}. ${q.question}`)] : []),
    "",
    "Who to ask",
    ...(r.plan.asks.length ? r.plan.asks.map((a) => `  ${a.who.padEnd(20)} ${a.role.padEnd(9)} ${{ ask: "ask", "ask-lead": "ask, as lead", suggest: "possible owner" }[a.action].padEnd(15)} ${a.why}`) : ["  Nobody named."]),
    ...(r.plan.notes.length ? ["", "Notes", ...r.plan.notes.map((n) => `  ${n}`)] : []),
    "",
    `$${t.costUsd.toFixed(4)} · ${t.modelCalls} model calls · ${t.toolCalls} GitHub calls · ${(t.latencyMs / 1000).toFixed(1)} s · trace ${tracePath}`,
  ];
  console.log(lines.join("\n"));
}

/** Updates the sign-off check. It's a side job: if the token can't write
 * checks, the review still stands, so this warns instead of failing. */
async function writeCheck(token: string | undefined, ref: PullRef, sha: string, s: Signoff, u?: Understanding) {
  try {
    const url = await github(token).check(ref, sha, CHECK, toCheck(s, u));
    console.log(`Sign-off: ${toCheck(s, u).title} (${url})`);
  } catch (e) {
    const hint = process.env.GITHUB_ACTIONS
      ? " Add `checks: write` to the workflow's permissions."
      : " GitHub only lets apps write checks, so this part works in GitHub Actions, not with a personal token.";
    console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}The ${CHECK} check wasn't updated: ${(e as Error).message}${hint}`);
  }
}

/** Grades the engineer's latest answers to the understanding check, each
 * answer once (grades are kept in Vera's comment). Without the repo's
 * Anthropic key the answers can't be read or graded, and it says so. */
async function understanding(body: string, s: Signoff, reviews: PullReview[], comments: Comment[]): Promise<{ u?: Understanding; grades: Grades }> {
  const exam = readExam(body);
  const grades = readGrades(body);
  if (!exam) return { grades };
  const u: Understanding = { questions: exam.questions.length, answered: 0, passed: 0, graded: false, reasons: [] };
  const signer = s.roles.find((r) => r.role === "engineer")?.by;
  const latest = signer ? latestAnswers(signer, exam.at, reviews, comments, MARKER) : null;
  if (!latest) return { u, grades };
  const apiKey = optional("ANTHROPIC_API_KEY");
  const keys = apiKey ? open(exam.keys, apiKey) : null;
  const good = keys ? (JSON.parse(keys) as string[]) : null;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  let all = true;
  for (const [n, question] of exam.questions.entries()) {
    const answer = latest.answers.get(n + 1);
    const key = `${latest.id}:${n}`;
    if (!answer) {
      u.reasons.push(`${question} _Not answered._`);
      continue;
    }
    u.answered++;
    if (!(key in grades) && anthropic && good?.[n]) {
      const g = parseJson<Grade>(await anthropic.messages.create(gradeRequest(flag("--model", "claude-sonnet-5-5"), { question, good_answer: good[n]!, cites: [] }, answer)));
      if (g) grades[key] = { pass: g.pass, reason: g.reason };
    }
    const g = grades[key];
    if (!g) all = false;
    else if (g.pass) u.passed++;
    u.reasons.push(`${question} ${g ? `${g.pass ? "✓" : "✗"} ${g.reason}` : "_Not graded yet._"}`);
  }
  u.graded = all;
  if (!all) console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Some answers weren't graded: ${!apiKey ? "no ANTHROPIC_API_KEY" : !keys ? "the key differs from the one the questions were sealed with" : "the grader gave no answer"}.`);
  return { u, grades };
}

/** Vera answers a question asked in a spot's thread, and asks the author when only they can tell. */
async function explain(gh: ReturnType<typeof github>, ref: PullRef, pull: Awaited<ReturnType<ReturnType<typeof github>["pull"]>>, brief: NonNullable<ReturnType<typeof readBrief>>, at: number, lines: LineComment[], asker: string): Promise<void> {
  const apiKey = optional("ANTHROPIC_API_KEY");
  const spot = brief.spots[at]!;
  if (!apiKey || !spot.thread) return;
  const thread = lines.filter((c) => c.id === spot.thread || c.replyTo === spot.thread).sort((a, b) => a.at.localeCompare(b.at)).map((c) => ({ who: c.who, body: c.body }));
  const diff = pull.files.find((f) => f.path === spot.file)?.patch ?? "";
  const m = await new Anthropic({ apiKey }).messages.create(explainRequest(flag("--model", "claude-sonnet-5-5"), { title: pull.title, about: brief.about ?? null, spot, diff, thread }));
  const e = parseExplanation(m);
  if (!e) return console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Vera had no answer for the question in the thread on ${spot.file}.`);
  const author = e.needsAuthor && asker.toLowerCase() !== pull.author.toLowerCase() ? [`@${pull.author}, can you fill in what Vera can't tell from the code?`] : [];
  await gh.reply(ref, spot.thread, [e.answer, "", ...author, ...(author.length ? [""] : []), "<sub>Vera explains from the diff and the thread; whether it's right is your call.</sub>"].join("\n"))
    .catch((err) => console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Vera's answer wasn't posted: ${(err as Error).message}`));
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
if (!["review", "sign-off"].includes(args[0] ?? "") || !args[1]) {
  console.error(USAGE);
  process.exit(2);
}

if (args[0] === "sign-off") {
  const token = optional("GITHUB_TOKEN");
  try {
    const ref = parsePullUrl(args[1]);
    const gh = github(token);
    const [pull, raw] = await Promise.all([gh.pull(ref), gh.comments(ref)]);
    const comments = fromSlack(raw, SLACK_APP);
    const vera = comments.find((c) => c.body.includes(MARKER));
    const asks = vera && readPlan(vera.body);
    if (!asks) {
      console.log(vera ? "Vera's comment here predates sign-off; its next review adds the check." : "Vera hasn't reviewed this pull request yet, so there's no sign-off to update.");
      process.exit(0);
    }
    const reviews = await gh.reviews(ref);
    // A comment from before the blocks per person has no brief, and shows its questions elsewhere.
    const brief = readBrief(vera.body);
    // With Verify, each spot's answers are replies in its thread on the code, and GitHub says who wrote them.
    const lines = brief?.verify ? await gh.lineComments(ref).catch(() => null) : null;
    const answered = brief && lines ? answers(brief.spots, lines, SLACK_APP) : null;
    const s = status(asks, pull.author, reviews, comments, MARKER, answered && lines ? verifiedEvents(answered.verified, lines) : []);
    const { u, grades } = await understanding(vera.body, s, reviews, comments);
    await writeCheck(token, ref, pull.headSha, s, u);
    // The comment's status block too, so it doesn't say "waiting" after someone signed off.
    const exam = brief && readExam(vera.body);
    const body = withStatus(vera.body, statusBlock(s, asks, u, grades, brief ? { brief, exam: exam ? { questions: exam.questions, why: exam.why } : null, ...(answered ? { status: answered.status } : {}) } : undefined));
    // Each person's Slack message too, when they were sent one.
    const sent = readSent(vera.body);
    const slackToken = optional("SLACK_BOT_TOKEN");
    if (slackToken && brief && Object.keys(sent).length) {
      const pr = { url: ref.url, repo: `${ref.owner}/${ref.repo}`, number: ref.number, title: pull.title, author: pull.author };
      const extra = { ...(brief.summary ? { summary: brief.summary } : {}), ...(brief.ai ? { ai: brief.ai } : {}), ...(exam ? { why: exam.why } : {}), signOff: !!SLACK_APP,
        ...(brief.verify ? { verify: { spots: brief.spots, ...(answered ? { status: answered.status } : {}) } } : {}) };
      const { problems } = await sendAll(slackToken, new Map(), people(asks, brief, exam?.questions ?? []), (p) => message(p, pr, s, extra, u), sent);
      for (const p of problems) console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Slack message not updated for ${p}`);
    }
    if (body && body !== vera.body) await gh.comment(ref, body, MARKER).catch((e) => console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Vera's comment wasn't updated: ${(e as Error).message}`));
    // A reply in a spot's thread: 👍 when it's a ✓ that counts, 👀 on a change for the author,
    // and an answer for a question.
    const id = Number(flag("--comment-id", ""));
    const said = lines?.find((x) => x.id === id);
    const at = said && brief ? brief.spots.findIndex((x) => x.thread !== undefined && x.thread === said.replyTo) : -1;
    if (said && brief && at >= 0 && !said.who.endsWith("[bot]")) {
      const spot = brief.spots[at]!;
      const v = verdict(said.body);
      const asked = spot.who.some((w) => w.replace(/^@/, "").toLowerCase() === said.who.toLowerCase());
      if (v === "verified" && asked) await gh.reactLine(ref, said.id, "+1").catch(() => {});
      if (v === "change") await gh.reactLine(ref, said.id, "eyes").catch(() => {});
      if (v === "question") await explain(gh, ref, pull, brief, at, lines!, said.who);
    }
    // A thumbs-up tells the person their sign-off counted; a confused face, that it didn't.
    const c = comments.find((x) => x.id === id);
    const roles = c && parseSignoff(c.body);
    if (c && roles) await gh.react(ref, c.id, counts(asks, pull.author, c.who, c.trusted, roles) ? "+1" : "confused").catch(() => {});
  } catch (e) {
    console.error(`vera: ${(e as Error).message}`);
    process.exit(1);
  }
  process.exit(0);
}
const out = flag("--out", ".vera/runs");
let apiKey: string;
try {
  apiKey = secret("ANTHROPIC_API_KEY");
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const githubToken = optional("GITHUB_TOKEN");
const configPath = args.includes("--config") ? flag("--config", "") : "";
let config: string | undefined;
if (configPath) {
  try {
    config = readFileSync(configPath, "utf8");
  } catch {
    console.error(`vera: can't read ${configPath}`);
    process.exit(2);
  }
}
try {
  // Verify, Also changed and Cleared: off unless asked for, until study 08 passes.
  const verify = args.includes("--verify") || process.env.VERA_VERIFY === "true";
  const r = await review(args[1], { apiKey, model: flag("--model", "claude-sonnet-5-5"), ...(githubToken ? { githubToken } : {}), ...(config !== undefined ? { config } : {}), verify });
  mkdirSync(out, { recursive: true });
  const path = join(out, `${r.trace.events[0]?.type === "run.start" ? r.trace.events[0].runId : Date.now()}.jsonl`);
  writeFileSync(path, toJsonl(r.trace));
  if (args.includes("--comment")) {
    // Sign-offs from before this push still count, so they're read first.
    const gh = github(githubToken);
    // If they can't be read, the review is still posted, showing everyone as waiting,
    // but the check is left as it was rather than reset; the next sign-off corrects both.
    const read = await Promise.all([gh.reviews(r.pull.ref), gh.comments(r.pull.ref).then((c) => fromSlack(c, SLACK_APP))]).catch(() => null);
    const before = read?.[1].find((c) => c.body.includes(MARKER))?.body ?? "";
    // With Verify, each spot gets a thread on its lines: the one from before when the spot
    // is still there (so a push keeps the conversation), or a new one.
    let threads: Threads | undefined;
    if (r.triage) {
      const spots = briefOf(r).spots;
      let lines = await gh.lineComments(r.pull.ref);
      const fresh = newThreads(spots, r.triage.hunks, reuse(spots, lines));
      if (fresh.length) {
        await gh.startThreads(r.pull.ref, r.pull.headSha, fresh).catch((e) => console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Vera's spots weren't posted on the code: ${(e as Error).message}`));
        lines = await gh.lineComments(r.pull.ref);
      }
      threads = { comments: lines, ids: reuse(spots, lines), ...(SLACK_APP ? { app: SLACK_APP } : {}) };
    }
    // Engineers who already answered ✓ on all their spots stay signed off, as approvals do.
    const done = threads ? verifiedEvents(answers(briefOf(r, threads).spots, threads.comments, SLACK_APP).verified, threads.comments) : [];
    const s = read && status(r.plan.asks, r.pull.author, read[0], read[1], MARKER, done);
    const prior = readSent(before);
    // New questions mean earlier answers don't count; the engineer answers these ones.
    const u: Understanding | undefined = r.exam ? { questions: r.exam.questions.length, answered: 0, passed: 0, graded: false, reasons: [] } : undefined;
    let body = toMarkdown(r, s ?? undefined, apiKey, u, threads);
    const slackToken = optional("SLACK_BOT_TOKEN");
    if (slackToken) {
      const brief = readBrief(body)!;
      const everyone = people(r.plan.asks, brief, r.exam?.questions.map((q) => q.question) ?? []);
      const pr = { url: r.pull.ref.url, repo: `${r.pull.ref.owner}/${r.pull.ref.repo}`, number: r.pull.ref.number, title: r.pull.title, author: r.pull.author };
      const now = s ?? signoff(r.plan.asks, r.pull.author, []);
      const extra = { ...(brief.summary ? { summary: brief.summary } : {}), ...(brief.ai ? { ai: brief.ai } : {}), ...(r.exam ? { why: r.exam.why } : {}), signOff: !!SLACK_APP,
        ...(brief.verify && threads ? { verify: { spots: brief.spots, status: answers(brief.spots, threads.comments, SLACK_APP).status } } : {}) };
      const ids = slackIds(r.ownership);
      const { sent, problems } = await sendAll(slackToken, ids, everyone, (p) => message(p, pr, now, extra, u), prior);
      body = withSent(body, sent);
      // .vera.yml comes from the branch the PR merges into, so an ID added in this PR only counts once it's merged.
      const noId = everyone.filter((p) => !ids.has(p.who.toLowerCase())).length;
      console.log(`Slack: ${Object.keys(sent).length} of ${everyone.length} ${everyone.length === 1 ? "person" : "people"} messaged${noId ? ` (${noId} with no slack ID in .vera.yml on ${r.pull.baseRef}, the branch this merges into)` : ""}.`);
      for (const p of problems) console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Slack message not sent to ${p}`);
    } else body = withSent(body, prior);
    console.log(`Posted: ${await gh.comment(r.pull.ref, body, MARKER)}`);
    if (s) await writeCheck(githubToken, r.pull.ref, r.pull.headSha, s, u);
    else console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Couldn't read the PR's reviews, so the ${CHECK} check wasn't updated.`);
  } else if (args.includes("--markdown")) {
    console.log(toMarkdown(r, undefined, apiKey));
  } else {
    print(r, path);
  }
} catch (e) {
  console.error(`vera: ${(e as Error).message}`);
  process.exit(1);
}
