import Link from "next/link";
import { Arrow } from "@/components/Arrow";
import { BarChart } from "@/components/BarChart";
import { ColumnChart } from "@/components/ColumnChart";
import { FAMILIES, SOURCES, familyOf, overview, postsByMonth, rounds, sourceCounts, stageCounts } from "@/lib/data";
import { day, month, monthShort, num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence" };

export default function Evidence() {
  const o = overview();
  const stages = stageCounts();
  const monthRows = postsByMonth();
  const allRounds = rounds();
  const sources = sourceCounts();
  // Months stack by source family, so the chart stays at three series.
  const series = FAMILIES.filter((f) => sources.some((c) => familyOf(c.source) === f.key));
  const months = [...new Set(monthRows.map((m) => m.month))].map((m) => {
    const values: Record<string, number> = {};
    for (const r of monthRows.filter((r) => r.month === m)) {
      const fam = familyOf(r.source);
      values[fam] = (values[fam] ?? 0) + r.posts;
    }
    return { month: m, values };
  });
  const rate = o.judged ? o.relevant / o.judged : 0;
  const estimate = Math.round(o.corpus * rate);
  const lastMonth = months[months.length - 1]?.month;

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Evidence · the data</p>
        <h1>Where do product teams lose time?</h1>
        <p className="lede">
          Before choosing what to build, we measure it. Public posts from people who build software are
          collected, cleaned, read and coded by pain. Every finding here links back to the posts behind it.
        </p>
      </div>

      <section className="hero" aria-label="Corpus size">
        <span className="hero-value">{num(o.corpus)}</span>
        <p className="muted">
          posts in the corpus, from {num(o.pulled)} pulled across {allRounds.length} rounds and{" "}
          {sources.length} sources · {day(o.first)} – {day(o.last)}
        </p>
      </section>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Read by hand</span>
          <span className="tile-value">{num(o.judged)}</span>
          <span className="tile-note">random samples from each round</span>
        </div>
        <div className="tile">
          <span className="tile-label">About a real pain</span>
          <span className="tile-value">{pct(o.relevant, o.judged)}</span>
          <span className="tile-note">{num(o.relevant)} of {num(o.judged)} read</span>
        </div>
        <div className="tile">
          <span className="tile-label">Coded by pain</span>
          <span className="tile-value">{num(o.coded)}</span>
          <span className="tile-note">{o.coded === 0 ? "next: model coding with codebook v1" : "posts with at least one code"}</span>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>From pulled to coded</h2>
          <p>Each step removes posts that can&apos;t tell us about a pain. The striped bar is an estimate from the sample.</p>
        </div>
        <div className="card">
          <BarChart
            caption="Posts at each step of the pipeline"
            bars={[
              { label: "Pulled", value: o.pulled, detail: "Everything the search API returned", href: "/rounds" },
              { label: "Contain the term", value: o.corpus, detail: `${pct(o.corpus, o.pulled)} of pulled · typo matches removed`, href: "/posts" },
              {
                label: "About a pain",
                value: estimate,
                display: `~${num(estimate)}`,
                detail: `${pct(o.relevant, o.judged)} of ${num(o.judged)} read, applied to the corpus`,
                variant: "estimate",
                href: "/posts?judged=relevant",
              },
              { label: "Coded", value: o.coded, display: o.coded ? num(o.coded) : "not started", detail: "Posts with at least one pain code" },
            ]}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Where the posts come from</h2>
          <p>
            Hacker News is mostly engineers. Stack Exchange adds designers and project and product managers. Hover for how many were read and found to be about a pain.
          </p>
        </div>
        <div className="card">
          <BarChart
            caption="Corpus posts per source"
            bars={sources.map((c) => ({
              label: SOURCES.find((src) => src.key === c.source)?.label ?? c.source,
              value: c.corpus,
              detail: c.judged
                ? `${c.relevant} of ${c.judged} read were about a pain · since ${day(c.first)}`
                : `none read yet · since ${day(c.first)}`,
              href: `/posts?source=${c.source}`,
            }))}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Posts per month</h2>
          <p>
            Corpus posts by the month they were written. Hacker News starts in October 2024; the
            Stack Exchange sites go back five years because they&apos;re small. The last month is partial.
          </p>
        </div>
        <div className="card">
          <ColumnChart
            caption="Corpus posts per month, by source"
            series={series.map((f) => ({ key: f.key, label: f.label }))}
            everyNth={6}
            columns={months.map((m) => ({
              key: m.month,
              label: month(m.month),
              tick: monthShort(m.month),
              values: m.values,
              partial: m.month === lastMonth,
            }))}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>By stage of the work</h2>
          <p>
            Posts by the part of a product team&apos;s work their search terms covered. A post can count in
            more than one stage. Stack Exchange posts have no stage: they came in as whole sites, not through
            a term.
          </p>
        </div>
        <div className="card">
          <BarChart
            caption="Corpus posts per stage"
            bars={stages.map((s) => ({
              label: s.stage,
              value: s.posts,
              detail: s.judged ? `${s.relevant} of ${s.judged} read were about a pain` : "none read yet",
              href: `/posts?stage=${s.stage}`,
            }))}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Rounds</h2>
          <Link href="/rounds">Every search term<Arrow /></Link>
        </div>
        <div className="grid-2">
          {allRounds.map((r) => (
            <article key={r.id} className="card list" style={{ gap: 10 }}>
              <p className="eyebrow">Round {r.id} · {day(r.started_at)}</p>
              <p>{r.note}</p>
              <dl className="kv">
                <dt>Search terms</dt><dd>{r.queries}</dd>
                <dt>Posts pulled</dt><dd>{num(r.pulled)}</dd>
                <dt>Contain the term</dt><dd>{num(r.exact)} ({pct(r.exact, r.pulled)})</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
