import type { Metadata } from "next";
import { BarChart } from "@/components/BarChart";
import { StatusBadge } from "@/components/StatusBadge";
import { PROJECT_LABEL, approvalWaits, projectRoles, studyTests, studyTotals } from "@/lib/gitlab";
import { day, num } from "@/lib/format";
import { AGENT_LABEL, agentBacklog } from "@/lib/agent-backlog";

export const metadata: Metadata = { title: "Work data" };

const dur = (h: number | null) =>
  h === null ? "–" : h < 48 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;

type Result = Record<string, unknown>;

function Summary({ id, r }: { id: string; r: Result }) {
  if (id === "G1") {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Project</th><th className="num">Sampled</th><th className="num">To first approval</th><th className="num">To merge</th><th className="num">Share</th></tr>
          </thead>
          <tbody>
            {Object.entries(r).map(([project, v]) => {
              const x = v as Record<string, number | null>;
              return (
                <tr key={project}>
                  <td>{PROJECT_LABEL[project] ?? project}</td>
                  <td className="num">{num(x.sampled_merged ?? 0)}</td>
                  <td className="num">{dur(x.median_hours_to_first_approval)}</td>
                  <td className="num">{dur(x.median_hours_to_merge)}</td>
                  <td className="num">{x.share === null ? "–" : `${Math.round((x.share ?? 0) * 100)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  const ci = r.ratio_95ci as [number, number] | null;
  const rows: [string, string][] =
    id === "G2"
      ? [
          ["Engineers", `${dur(r.median_hours_engineering as number)} · ${num(r.engineering_n as number)} MRs`],
          ["Non-engineers", `${dur(r.median_hours_non_engineering as number)} · ${num(r.non_engineering_n as number)} MRs`],
        ]
      : [
          ["Reviewed within one role", `${dur(r.median_hours_one_role as number)} · ${num(r.one_role_n as number)} MRs`],
          ["Reviewers from two or more roles", `${dur(r.median_hours_two_plus_roles as number)} · ${num(r.two_plus_roles_n as number)} MRs`],
        ];
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <span key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </span>
      ))}
      <dt>Ratio</dt>
      <dd>
        <strong style={{ fontWeight: 500 }}>{r.ratio ? `${r.ratio}x` : "–"}</strong>
        {ci ? <span className="muted"> · 95% interval {ci[0]}x to {ci[1]}x</span> : null}
      </dd>
    </dl>
  );
}

export default function Work() {
  const totals = studyTotals();
  const tests = studyTests();
  const roles = projectRoles();
  const handbookWaits = approvalWaits("handbook", true);
  const productWaits = approvalWaits("product");
  const backlog = agentBacklog();
  const p = (x: number | null | undefined) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Study 02 · GitLab work data</p>
        <h1>How long work waits, by role</h1>
        <p className="lede">
          Forum posts say what hurts. This measures what happens: merge requests at GitLab, which works in public,
          by the role of the person who opened them. Designed and committed before any data was pulled.
        </p>
      </div>

      <section className="hero" aria-label="Merge requests analysed">
        <span className="hero-value">{num(totals.mrs)}</span>
        <p className="muted">
          merge requests from 19 Oct 2024, {num(totals.sampled)} sampled for approval times · roles for{" "}
          {num(totals.people)} team members, stored only as salted hashes
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>The tests</h2>
          <p>Each was written with the result that would disprove it, before pulling.</p>
        </div>
        {tests.length === 0 ? (
          <p className="muted">Not run yet. Waiting on the sampled approval details.</p>
        ) : (
          <div className="list">
            {tests.map((t) => (
              <article key={t.id} className="card" style={{ display: "grid", gap: 12 }}>
                <div className="section-head" style={{ margin: 0 }}>
                  <span className="mono muted">{t.hypothesis_id} · ran {day(t.ran_at)}</span>
                  <StatusBadge status={t.status} />
                </div>
                <h2 style={{ fontSize: 18, maxWidth: 760 }}>{t.statement}</h2>
                <Summary id={t.hypothesis_id} r={JSON.parse(t.result_json)} />
                <p className="muted" style={{ fontSize: 13 }}>Disproved if: {t.disproved_if}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {handbookWaits.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Handbook: waiting for first approval</h2>
            <p>Small merged MRs (3 files or fewer), median hours until someone other than the author approved.</p>
          </div>
          <div className="card">
            <BarChart
              caption="Median time to first approval, handbook small MRs, by author role"
              bars={handbookWaits.map((w) => ({
                label: w.role,
                value: w.medianHours ?? 0,
                display: dur(w.medianHours),
                detail: `${num(w.n)} sampled MRs`,
              }))}
            />
          </div>
        </section>
      ) : null}

      {productWaits.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Product: waiting for first approval</h2>
            <p>Merged MRs in gitlab-org/gitlab, median hours until first approval, by who opened them.</p>
          </div>
          <div className="card">
            <BarChart
              caption="Median time to first approval, product repo, by author role"
              bars={productWaits.map((w) => ({
                label: w.role,
                value: w.medianHours ?? 0,
                display: dur(w.medianHours),
                detail: `${num(w.n)} sampled MRs`,
              }))}
            />
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Who opens merge requests</h2>
          <p>Every MR in the window. &ldquo;Unknown&rdquo; means the author isn&apos;t on the current team page.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Project</th><th>Author role</th><th className="num">MRs</th><th className="num">Merged</th><th className="num">Median to merge</th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={`${r.project}-${r.role}`}>
                  <td>{PROJECT_LABEL[r.project]}</td>
                  <td>{r.role}</td>
                  <td className="num">{num(r.mrs)}</td>
                  <td className="num">{num(r.merged)}</td>
                  <td className="num">{dur(r.medianHoursToMerge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {backlog ? (
        <section className="section">
          <div className="section-head">
            <h2>Coding agents&rsquo; pull requests (study 07)</h2>
            <p>
              Someone told me their team has hundreds of PRs from Devin that nobody has checked, and many no longer apply.
              One story isn&rsquo;t data, so I sampled {num(backlog.sampled_prs)} PRs opened by five coding agents on public
              GitHub and checked them two months later. Active repos have 10+ stars and a push in the last month
              ({num(backlog.active_repos)} of {num(backlog.repos)}).
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Test, written before the data</th><th>Result</th><th>Verdict</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>At least 20% of agent PRs still open two months on</td>
                  <td>{p(backlog.D1.active.share)} in active repos; {p(backlog.D1.all.share)} across all repos, mostly abandoned ones</td>
                  <td><StatusBadge status={backlog.D1.verdict} /></td>
                </tr>
                <tr>
                  <td>At least 50 active repos with 20+ agent PRs open over 30 days</td>
                  <td>{num(backlog.D2.repos_active)} repos, the two largest holding {num(backlog.D2.largest_active[0] ?? 0)} and {num(backlog.D2.largest_active[1] ?? 0)}</td>
                  <td><StatusBadge status={backlog.D2.verdict} /></td>
                </tr>
                <tr>
                  <td>At least 30% of open agent PRs in active repos can&rsquo;t merge cleanly</td>
                  <td>{backlog.D3.active.conflicts} of {backlog.D3.active.known}, too few to rely on; {p(backlog.D3.all.share)} across all repos</td>
                  <td><StatusBadge status={backlog.D3.verdict} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr><th>Agent, active repos</th><th className="num">PRs</th><th className="num">Merged</th><th className="num">Closed unmerged</th><th className="num">Still open</th></tr>
              </thead>
              <tbody>
                {Object.entries(backlog.per_agent).map(([agent, v]) =>
                  v.active ? (
                    <tr key={agent}>
                      <td>{AGENT_LABEL[agent] ?? agent}</td>
                      <td className="num">{num(v.active.n)}</td>
                      <td className="num">{p(v.active.merged)}</td>
                      <td className="num">{p(v.active.closed)}</td>
                      <td className="num">{p(v.active.open)}</td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12, maxWidth: 720 }}>
            The story is real but concentrated: most active teams merge or close agent PRs, and a few that use agents
            heavily hold hundreds nobody has reviewed. Public GitHub is a blind spot here, since teams like the one that
            raised it work in private repos, and agents that open PRs under a person&rsquo;s account can&rsquo;t be counted.
          </p>
        </section>
      ) : null}
    </>
  );
}
