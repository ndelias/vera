import Link from "next/link";
import { Arrow } from "@/components/Arrow";
import { BarChart } from "@/components/BarChart";
import { ColumnChart } from "@/components/ColumnChart";
import { DotField } from "@/components/DotField";
import { NodeFlow } from "@/components/NodeFlow";
import {
  COMPETITORS,
  DIFFERENTIATORS,
  FIRST_CUSTOMERS,
  GAPS,
  KILL_CRITERIA,
  PAINS,
  PERSONAS,
  RULED_OUT,
  TRADEOFFS,
  VERA,
  type Cell,
  type Competitor,
} from "@/lib/case-content";
import { aiAdoption, headline, method, ranking, sampleCounts, voices, volumeVsSpeed } from "@/lib/case";
import { sourceLabel } from "@/lib/data";
import { day, monthShort, month, num } from "@/lib/format";

export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function GapCell({ value }: { value: Cell }) {
  return <span className={`cell is-${value}`}>{value}</span>;
}

function Row({ c, vera = false }: { c: Competitor; vera?: boolean }) {
  return (
    <tr className={vera ? "is-vera" : undefined}>
      <th scope="row">
        {c.name}
        <span className="muted cell-what">{c.what}</span>
      </th>
      {GAPS.map((g) => (
        <td key={g.key}>
          <GapCell value={c[g.key]} />
        </td>
      ))}
      <td className="muted" style={{ whiteSpace: "nowrap" }}>{c.price}</td>
    </tr>
  );
}

export default function Case() {
  const h = headline();
  const ai = aiAdoption();
  const vs = volumeVsSpeed();
  const ranked = ranking();
  const quotes = voices(PAINS.map((p) => p.code), 2);
  const m = method();
  const counts = sampleCounts();

  return (
    <>
      <section className="hero reveal" aria-labelledby="hero-title">
        <p className="eyebrow">Vera · review for the AI era</p>
        <h1 className="hero-title" id="hero-title">
          <span>Understood.</span>
          <span>Signed off.</span>
          <span>Shipped.</span>
        </h1>
        <p className="lede hero-lede">
          As AI writes more of the code, reviewers approve changes they no longer fully understand. Before building
          anything, I set out to find where product teams actually lose time, how big the problem is, and whether someone
          has already solved it. This page is the case for what I chose to build.
        </p>
        <div className="hero-actions">
          <Link href="#market" className="pill">Where Vera fits</Link>
          <Link href="/evidence" className="pill is-quiet">See the evidence</Link>
        </div>
      </section>

      <section className="section" aria-label="How Vera works on one change">
        <NodeFlow />
      </section>

      <section aria-label="The problem in numbers" className="stats">
        <div className="stat">
          <span className="stat-value">2×</span>
          <span className="stat-label">code per change</span>
          <span className="stat-note">
            Median lines per merge request went from {h.linesFirst} to {h.linesLast} in two years. Time to merge stayed flat (
            {Math.round(h.mergeHoursFirst)} h to {Math.round(h.mergeHoursLast)} h).
          </span>
        </div>
        <div className="stat">
          <span className="stat-value">-{pct(h.attentionDrop)}</span>
          <span className="stat-label">review attention per line</span>
          <span className="stat-note">Review comments per line of code, same period. Exploratory.</span>
        </div>
        <div className="stat is-lime">
          <span className="stat-value">{pct(h.aiShareLast)}</span>
          <span className="stat-label">of changes written with AI</span>
          <span className="stat-note">
            Up from {pct(h.aiShareFirst)} a year earlier: merge requests that disclose AI help. Disclosure undercounts use.
          </span>
        </div>
        <div className="stat">
          <span className="stat-value">{h.crossRoleRatio}×</span>
          <span className="stat-label">wait when several roles sign off</span>
          <span className="stat-note">
            Small changes reviewed by people from 2+ roles
            {h.crossRoleCi ? ` (95% interval ${h.crossRoleCi[0]}–${h.crossRoleCi[1]}×)` : ""}.
          </span>
        </div>
      </section>
      <p className="chart-note">
        Measured on GitLab&apos;s product repo, which is developed in public: 105,397 merge requests, roles from its public
        team page. <Link href="/work">See the work data<Arrow /></Link>
      </p>

      <section className="section" id="why-now">
        <div className="section-head">
          <h2>Why now</h2>
          <p>
            AI-assisted changes went from rare to routine within a year. The amount of code arriving for review doubled, and
            the time teams spend on it didn&apos;t move. Something had to give, and it was attention.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Merge requests that disclose AI help, by month</h3>
          <ColumnChart
            caption="Share of sampled GitLab merge requests disclosing AI help, by month"
            series={[{ key: "share", label: "AI-disclosed" }]}
            unit="%"
            everyNth={3}
            columns={ai.map((a) => ({
              key: a.month,
              label: month(a.month),
              tick: monthShort(a.month),
              values: { share: Math.round(a.share * 1000) / 10 },
            }))}
          />
        </div>
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Lines changed per merge request</h3>
            <ColumnChart
              caption="Median lines changed per merge request, by quarter"
              series={[{ key: "lines", label: "Median lines" }]}
              unit=" lines"
              everyNth={2}
              columns={vs.map((v) => ({ key: v.quarter, label: v.quarter, values: { lines: v.lines } }))}
            />
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Time to merge</h3>
            <ColumnChart
              caption="Median hours from opening to merge, by quarter"
              series={[{ key: "hours", label: "Median hours" }]}
              unit=" h"
              everyNth={2}
              columns={vs.map((v) => ({ key: v.quarter, label: v.quarter, values: { hours: Math.round(v.hours) } }))}
            />
          </div>
        </div>
      </section>

      <section className="section" id="voices">
        <div className="voices-head">
          <DotField
            counts={counts}
            label={`${num(counts.firstHand + counts.discussed + counts.other)} dots, one per coded post: ${num(counts.firstHand)} first-hand accounts of a pain, ${num(counts.discussed)} discussions of one, ${num(counts.other)} not about a pain.`}
          />
          <div className="voices-copy">
            <p className="eyebrow">In their words</p>
            <h2>{num(counts.firstHand + counts.discussed + counts.other)} posts, read and coded at random.</h2>
            <p className="muted">
              Each dot is one of them. Of all the pains people described, the ones around AI-made changes are by far the
              biggest group: {pct(h.clusterShare)} of relevant posts, and {pct(h.clusterShareFirstHand)} of first-hand
              accounts.
            </p>
            <ul className="legend-list">
              <li><span className="key is-lime" />{num(counts.firstHand)} describe a pain first-hand</li>
              <li><span className="key is-ink" />{num(counts.discussed)} discuss one</li>
              <li><span className="key is-dot" />{num(counts.other)} aren&apos;t about a pain</li>
            </ul>
            <p className="muted" style={{ fontSize: 13 }}>
              The quotes below are first-hand, picked by a fixed rule (known role first, then the longest passage), not by
              me.
            </p>
          </div>
        </div>
        <div className="quotes">
          {PAINS.map((p) => {
            const qs = quotes.filter((q) => q.code === p.code);
            if (qs.length === 0) return null;
            return (
              <div key={p.code} className="quote-group">
                <h3>{p.label}</h3>
                {qs.map((q) => (
                  <figure key={q.docId} className="quote">
                    <blockquote>&ldquo;{q.evidence}&rdquo;</blockquote>
                    <figcaption className="muted">
                      {q.speaker && q.speaker !== "unknown" ? `${q.speaker} · ` : ""}
                      {sourceLabel(q.source)} · {day(q.createdAt)} ·{" "}
                      <Link href={`/posts/${encodeURIComponent(q.docId)}`}>in context</Link>
                    </figcaption>
                  </figure>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section" id="size">
        <div className="section-head">
          <h2>How big each pain is</h2>
          <p>
            Twelve pains scored on how common they are, what they cost, whether someone has a budget for them, how well
            they&apos;re already solved, and whether agents suit them. The weights were fixed before scoring. The top two
            stay on top in 98% of runs when every judged score is nudged up or down by one.
          </p>
        </div>
        <div className="card">
          <BarChart
            caption="Stage 2 score out of 60"
            bars={ranked.map((r) => ({
              label: r.label,
              value: r.score,
              display: `${r.score}`,
              detail: `${pct(r.share)} of relevant posts · top 3 in ${pct(r.top3_under_nudging)} of nudged runs`,
              ...(r.code === "eng-dependency" ? { variant: "muted" as const } : {}),
            }))}
          />
        </div>
      </section>

      <section className="section" id="who">
        <div className="section-head">
          <h2>Who it&apos;s for</h2>
          <p>{FIRST_CUSTOMERS}</p>
        </div>
        <div className="personas">
          {PERSONAS.map((p) => (
            <article key={p.who} className="card persona">
              <span className="eyebrow">{p.role}</span>
              <h3>{p.who}</h3>
              <p className="muted">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="market">
        <div className="section-head">
          <h2>The market, and where Vera fits</h2>
          <p>
            The products closest to this problem, against the four things still unsolved: how much human reviewers can
            get through, proof they understood the change, sign-off across roles, and doing the rework. AI review bots are
            close to a commodity and auto-fix is crowded. Nothing checks understanding, and cross-role sign-off is partial
            at best.
          </p>
        </div>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table className="matrix">
            <thead>
              <tr>
                <th>Product</th>
                {GAPS.map((g) => (
                  <th key={g.key}>{g.label}</th>
                ))}
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              <Row c={VERA} vera />
              {COMPETITORS.map((c) => (
                <Row key={c.name} c={c} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="chart-note">
          From a teardown of public docs, pricing pages and reviews, October 2026. Vera doesn&apos;t do rework by design: it
          uses the bots&apos; findings and fixes instead of competing with them.
        </p>
        <div className="grid-3" style={{ marginTop: 24 }}>
          {DIFFERENTIATORS.map((d) => (
            <article key={d.title} className="card" style={{ display: "grid", gap: 8, alignContent: "start" }}>
              <h3>{d.title}</h3>
              <p className="muted">{d.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="tradeoffs">
        <div className="section-head">
          <h2>Trade-offs</h2>
          <p>Each decision, what I chose it over, and why.</p>
        </div>
        <div className="list">
          {TRADEOFFS.map((t) => (
            <article key={t.chose} className="card tradeoff">
              <h3>{t.chose}</h3>
              <dl className="kv">
                <dt>Over</dt>
                <dd>{t.over}</dd>
                <dt>Why</dt>
                <dd>{t.why}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="ruled-out">
        <div className="section-head">
          <h2>What the data ruled out</h2>
          <p>Including my own first idea. Each was written down with what would disprove it, before the data came in.</p>
        </div>
        <div className="list">
          {RULED_OUT.map((r) => (
            <article key={r.idea} className="card" style={{ display: "grid", gap: 6 }}>
              <h3 className="struck">{r.idea}</h3>
              <p className="muted">{r.evidence}</p>
            </article>
          ))}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>What would make me stop</h3>
          <ul className="plain-list">
            {KILL_CRITERIA.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section closing" aria-label="Hypotheses">
        <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
          <span className="display" style={{ fontSize: "clamp(36px, 5vw, 60px)" }}>
            {m.hypotheses.supported} / {m.hypotheses.disproved}
          </span>
          <p className="muted" style={{ fontSize: 18 }}>
            Hypotheses supported and disproved, each written down with what would disprove it before the data came in.
            Including my own first idea.
          </p>
        </div>
        <Link href="/hypotheses" className="pill is-lime">Every hypothesis</Link>
      </section>

      <section className="section" id="method">
        <div className="section-head">
          <h2>How the evidence was gathered</h2>
          <p>
            Measured in full where the data allowed it, sampled at random where reading every post wasn&apos;t
            needed. Every plan, search term and scoring rule was committed before the data it applies to.
          </p>
        </div>
        <div className="stats is-small">
          <div className="stat">
            <span className="stat-value">{num(m.mrs)}</span>
            <span className="stat-label">merge requests, measured in full</span>
            <span className="stat-note">Every GitLab MR over two years: review time, size, and who opened and reviewed it</span>
          </div>
          <div className="stat">
            <span className="stat-value">{num(m.corpus)}</span>
            <span className="stat-label">posts searched and cleaned</span>
            <span className="stat-note">
              From {num(m.pulled)} pulled. Posts that matched a search term only by typo were removed
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">{num(m.coded)}</span>
            <span className="stat-label">read and coded, at random</span>
            <span className="stat-note">
              A random sample is enough to rank pains: every share carries a 95% interval, 2–4 points either way. Two independent
              passes agreed on 96.5% of posts
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {m.hypotheses.supported} / {m.hypotheses.disproved}
            </span>
            <span className="stat-label">hypotheses supported / disproved</span>
            <span className="stat-note">Each written with what would disprove it first. {m.hypotheses.open} open or untestable</span>
          </div>
        </div>
        <p className="chart-note">
          <Link href="/evidence">All the evidence<Arrow /></Link> · <Link href="/hypotheses">Every hypothesis<Arrow /></Link> ·{" "}
          <Link href="/work">Work data<Arrow /></Link> · <Link href="/codebook">The codebook<Arrow /></Link>
        </p>
      </section>
    </>
  );
}
