import type { Metadata } from "next";
import { BarChart } from "@/components/BarChart";
import { ROLE_LABEL, find, pctOf, scores, type Score } from "@/lib/evals";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Evals" };

// Copy drafted in Nahuel's voice for him to edit (research/findings/09-evals.md, 10-agents.md).

const interval = (s: Score | undefined) =>
  s && s.lo !== null && s.hi !== null && !Number.isNaN(s.lo) ? `${pctOf(s.lo)} to ${pctOf(s.hi)}` : "";

export default function Evals() {
  const s = scores();
  if (!s.length) {
    return (
      <div className="page-head">
        <p className="eyebrow">Study 05 · Evals</p>
        <h1>The number to beat</h1>
        <p className="lede muted">Not in this snapshot yet.</p>
      </div>
    );
  }
  const map = (sys: string, metric: string, subset = "group") => find(s, sys, "mapping", metric, subset);
  const route = (sys: string, metric: string, role: string) => find(s, sys, "routing", metric, role);
  const ask = find(s, "B1-ask", "routing", "ask_rate", "any");
  const label = find(s, "label:fixup-v1", "fixup", "share_real", "positives");
  const label2 = find(s, "label:fixup-v2", "fixup", "share_real", "positives");
  const attention = (subset: string) => find(s, "data", "attention", "comments_per_100_lines", subset);
  const top3 = map("B1", "recall@3");
  const agent = (sys: string, task: string, metric: string, subset: string) => find(s, sys, task, metric, subset);
  const mapperV2 = agent("mapper-sonnet-v2", "agent_mapping", "top3", "listed");
  const hasAgents = Boolean(mapperV2);
  const cost = (sys: string) => agent(sys, "agent_cost", "usd_per_change", "batch")?.value;

  const ROUTERS: [string, string][] = [
    ["B2", "Hand rules (a day-one .vera.yml)"],
    ["B1", "Path lookup (learned from history)"],
    ["B1-ask", "Path lookup, asks the lead when unsure"],
  ];

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Study 05 · Evals</p>
        <h1>The number to beat</h1>
        <p className="lede">
          Before building any agent, I measured how well plain rules do its jobs, on {num(6000)} real merge requests at
          GitLab. Rules learned from the first half of the year and were scored on the second. The agents are scored on
          the same changes, the same way.
        </p>
      </div>

      <section className="hero" aria-label="Mapping, best baseline">
        <span className="hero-value">{pctOf(top3?.value)}</span>
        <p className="muted">
          of changes had the right owning team in the rules&rsquo; top three guesses ({num(top3?.n ?? 0)} test changes).
          The agents need 80%.
        </p>
      </section>

      {hasAgents ? (
        <section className="section">
          <div className="section-head">
            <h2>The first agents, on the same changes</h2>
            <p>
              Claude Sonnet 5.5, run as a batch, scored by the same code as the rules. The Mapper names the owning team;
              the visibility check reads a change and says whether it makes a design decision.
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Job</th><th className="num">Rules</th><th className="num">Agent</th><th className="num">Bar</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Owning team in the top three, 500 test changes</td>
                  <td className="num">{pctOf(agent("B1", "agent_mapping", "top3", "all")?.value)}</td>
                  <td className="num">{pctOf(agent("mapper-sonnet-v2", "agent_mapping", "top3", "all")?.value)}</td>
                  <td className="num muted">80%</td>
                </tr>
                <tr>
                  <td>Same, when the team was in that month&rsquo;s directory ({num(mapperV2?.n ?? 0)})</td>
                  <td className="num">{pctOf(agent("B1", "agent_mapping", "top3", "listed")?.value)}</td>
                  <td className="num">{pctOf(mapperV2?.value)}</td>
                  <td className="num muted">80%</td>
                </tr>
                <tr>
                  <td>Design: changes caught / pings needed, my 100 labels (first visibility check)</td>
                  <td className="num">{pctOf(agent("B2", "agent_design", "caught", "final")?.value)} / {pctOf(agent("B2", "agent_design", "needed", "final")?.value)}</td>
                  <td className="num">{pctOf(agent("router-v2", "agent_design", "caught", "final")?.value)} / {pctOf(agent("router-v2", "agent_design", "needed", "final")?.value)}</td>
                  <td className="num muted">80% / 80%</td>
                </tr>
                <tr>
                  <td>Files reviewers commented on, in the brief&rsquo;s first three places (105 GitHub PRs)</td>
                  <td className="num">{pctOf(agent("B-largest", "agent_brief", "recall3", "brief")?.value)}</td>
                  <td className="num">{pctOf(agent("briefer-sonnet-v1", "agent_brief", "recall3", "brief")?.value)}</td>
                  <td className="num muted">beat it</td>
                </tr>
                <tr>
                  <td>The same, with the brief&rsquo;s text cut to one sentence per place (what Vera&rsquo;s comment uses)</td>
                  <td className="num">{pctOf(agent("B-largest", "agent_brief", "recall3", "brief")?.value)}</td>
                  <td className="num">{pctOf(agent("briefer-sonnet-v2", "agent_brief", "recall3", "brief")?.value)}</td>
                  <td className="num muted">beat it</td>
                </tr>
                <tr>
                  <td>Questions for a designer that I rated good on all three checks ({num(agent("examiner-sonnet-v1", "agent_exam", "good", "ratings")?.n ?? 0)})</td>
                  <td className="num muted">–</td>
                  <td className="num">{pctOf(agent("examiner-sonnet-v1", "agent_exam", "good", "ratings")?.value)}</td>
                  <td className="num muted">80%</td>
                </tr>
                <tr>
                  <td>Questions for an engineer that I rated good on all three checks ({num(agent("examiner-eng-sonnet-v1", "agent_exam", "good", "ratings")?.n ?? 0)})</td>
                  <td className="num muted">–</td>
                  <td className="num">{pctOf(agent("examiner-eng-sonnet-v1", "agent_exam", "good", "ratings")?.value)}</td>
                  <td className="num muted">80%</td>
                </tr>
                <tr>
                  <td>Answers to those questions graded as expected: good passed, vague and wrong failed ({num(agent("grader-eng-sonnet-v1", "agent_exam", "grader_agree", "synthetic")?.n ?? 0)}, written to be clear-cut)</td>
                  <td className="num muted">–</td>
                  <td className="num">{pctOf(agent("grader-eng-sonnet-v1", "agent_exam", "grader_agree", "synthetic")?.value)}</td>
                  <td className="num muted">80%</td>
                </tr>
                <tr>
                  <td>Design decision or not, 50 changes it never saw while tuning</td>
                  <td className="num muted">–</td>
                  <td className="num">{pctOf(agent("visibility-sonnet-v2-holdout", "agent_visibility", "agree", "holdout")?.value)} agree</td>
                  <td className="num muted">–</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>
            The Mapper reads the change, the team directory and who owned those folders before; it beats the rules by about
            20 points and sits at the bar when the team is listed. Who owns a change didn&rsquo;t say whether a designer
            should see it, so a second agent reads the change and asks one question: does it make a design decision? The
            first version asked whether a user would notice anything, and flagged bug fixes and permission changes too.
            Asked the right question, it agreed with me on {num(Math.round((agent("visibility-sonnet-v2-holdout", "agent_visibility", "agree", "holdout")?.value ?? 0) * 50))} of
            50 changes it hadn&rsquo;t seen. I labelled those 100 changes, then read Claude&rsquo;s reasoning on each and
            revised 43 where it changed my mind; the revised labels are used. The Briefer tells an engineer where to look
            first, and on real pull requests that was where human reviewers commented 3 times in 4. The Examiner&rsquo;s
            questions for designers fell short: written from the code, half asked what only the code shows, and a
            designer needs to see the change to answer. For engineers, who read the code, I rated {num(Math.round((agent("examiner-eng-sonnet-v1", "agent_exam", "good", "ratings")?.value ?? 0) * 36))} of
            36 good, just over the bar; the misses were questions I could have guessed from the title. The Mapper and the check cost under a cent a change
            (Mapper ${(cost("mapper-sonnet-v2") ?? 0).toFixed(3)}, check ${(cost("visibility-sonnet-v2-holdout") ?? 0).toFixed(3)}); a brief, about two cents.
          </p>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Mapping: which team owns the change</h2>
          <p>
            Each change is labelled with the GitLab team that owns its area. The path lookup votes with the folders the
            change touches.
          </p>
        </div>
        <div className="card">
          <BarChart
            caption="Right team in the top three guesses, test changes"
            highlight={1}
            bars={[
              { label: "Path lookup", value: top3?.value ?? 0, display: pctOf(top3?.value), detail: interval(top3) },
              {
                label: "Path lookup, teams it had seen",
                value: map("B1", "recall@3", "group_seen")?.value ?? 0,
                display: pctOf(map("B1", "recall@3", "group_seen")?.value),
                detail: interval(map("B1", "recall@3", "group_seen")),
              },
              { label: "Always the biggest team", value: map("B0", "recall@3")?.value ?? 0, display: pctOf(map("B0", "recall@3")?.value) },
              { label: "Target for the agents", value: 0.8, display: "80%", variant: "muted", detail: "M2 target" },
            ]}
          />
        </div>
        <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>
          One in six test changes belongs to a team that didn&rsquo;t exist in the first half of the year. GitLab
          reorganized, mostly around AI. A map learned from history can&rsquo;t name a team it has never seen, which is
          why people declare their own areas in Vera.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Routing: who should review it</h2>
          <p>
            Two numbers per role. Caught: of the changes a designer really reviewed, how many were sent to one. Needed:
            of the pings sent, how many went to a change a designer really reviewed.
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rules</th>
                {Object.keys(ROLE_LABEL).map((r) => (
                  <th key={r} className="num">{ROLE_LABEL[r]}: caught / needed</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROUTERS.map(([sys, name]) => (
                <tr key={sys}>
                  <td>{name}</td>
                  {Object.keys(ROLE_LABEL).map((r) => {
                    const caught = route(sys, sys === "B1-ask" ? "recall_with_ask" : "recall", r);
                    const needed = route(sys, "precision", r);
                    return (
                      <td key={r} className="num">
                        {pctOf(caught?.value)} / {pctOf(needed?.value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="muted">Target for the agents</td>
                {Object.keys(ROLE_LABEL).map((r) => (
                  <td key={r} className="num muted">80% / 80%</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>
          &ldquo;Any frontend change goes to design&rdquo; catches {pctOf(route("B2", "recall", "design")?.value)} of
          design reviews, but only {pctOf(route("B2", "precision", "design")?.value)} of its pings are needed. When
          unsure, Vera asks the area&rsquo;s lead instead of guessing, on at most 1 change in 6. With that, the path lookup
          asks on {pctOf(ask?.value)} of changes and catches {pctOf(route("B1-ask", "recall_with_ask", "design")?.value)} of
          design reviews. Docs is mostly GitLab&rsquo;s technical writers. Product had only{" "}
          {route("B1", "recall", "product")?.n ?? 0} reviews in the test half, so treat it as rough.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Fix-ups: two labels that failed</h2>
          <p>
            I wanted to know which changes needed fixing within a week. I wrote two rules down before looking, and
            read 50 changes each rule flagged before using it.
          </p>
        </div>
        <dl className="kv">
          <dt>A later fix touched the same files</dt>
          <dd>
            <strong style={{ fontWeight: 500 }}>{pctOf(label?.value)}</strong>
            <span className="muted"> really fixed · {label?.n ?? 0} read, the bar was 80%</span>
          </dd>
          <dt>A later change linked it</dt>
          <dd>
            <strong style={{ fontWeight: 500 }}>{pctOf(label2?.value)}</strong>
            <span className="muted"> really fixed · {label2?.n ?? 0} read, the bar was 80%</span>
          </dd>
          <dt>Review comments per 100 lines (the fallback)</dt>
          <dd>
            {attention("all")?.value?.toFixed(1)}
            <span className="muted">
              {" "}
              · AI help disclosed {attention("ai")?.value?.toFixed(1)}, the rest {attention("not_ai")?.value?.toFixed(1)}
            </span>
          </dd>
        </dl>
        <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>
          Sharing a file mostly meant sharing a generated or busy file. A link mostly meant follow-up work, a stacked
          change, or a backport. So neither label is used, and the plan&rsquo;s fallback is: review comments per 100
          lines. AI-disclosed changes get about the same attention per line as the rest. I also tried a model that reads
          both changes: on 50 pairs I judged first, it found {pctOf(find(s, "judge-sonnet-v1", "agent_judge", "found", "verdicts")?.value)} of
          my fix-ups and rejected {pctOf(find(s, "judge-sonnet-v1", "agent_judge", "rejected", "verdicts")?.value)} of the rest, short of the
          80% and 90% it needed, so it isn&rsquo;t used either.
        </p>
      </section>
    </>
  );
}
