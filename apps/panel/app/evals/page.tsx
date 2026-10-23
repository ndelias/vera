import type { Metadata } from "next";
import { BarChart } from "@/components/BarChart";
import { ROLE_LABEL, find, pctOf, scores, type Score } from "@/lib/evals";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Evals" };

// Copy drafted in Nahuel's voice for him to edit (research/findings/09-evals.md).

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
  const attention = (subset: string) => find(s, "data", "attention", "comments_per_100_lines", subset);
  const top3 = map("B1", "recall@3");

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
          GitLab. Rules learned from the first half of the year and were scored on the second. No model anywhere. The
          agents have to beat these numbers, on the same changes, scored the same way.
        </p>
      </div>

      <section className="hero" aria-label="Mapping, best baseline">
        <span className="hero-value">{pctOf(top3?.value)}</span>
        <p className="muted">
          of changes had the right owning team in the rules&rsquo; top three guesses ({num(top3?.n ?? 0)} test changes).
          The agents need 80%.
        </p>
      </section>

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
          <h2>Fix-ups: a label that failed</h2>
          <p>
            I wanted to know which changes needed fixing within a week: a later fix that touched the same files. I read
            50 of them before using the label.
          </p>
        </div>
        <dl className="kv">
          <dt>Really fixed by the later change</dt>
          <dd>
            <strong style={{ fontWeight: 500 }}>{pctOf(label?.value)}</strong>
            <span className="muted"> · {label?.n ?? 0} read, the bar was 80%</span>
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
          Most &ldquo;fixes&rdquo; only shared a generated file or a busy one that gets an unrelated fix most weeks. So
          the label isn&rsquo;t used, and the plan&rsquo;s fallback is: review comments per 100 lines. AI-disclosed
          changes get about the same attention per line as the rest. A stricter label, a later change that reverts or
          links the first, is written down to try before the agents.
        </p>
      </section>
    </>
  );
}
