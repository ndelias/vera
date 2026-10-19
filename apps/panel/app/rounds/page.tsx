import type { Metadata } from "next";
import Link from "next/link";
import { queryRows, rounds } from "@/lib/data";
import { day, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Rounds" };
export const dynamic = "force-dynamic";

export default function Rounds() {
  const all = rounds();
  const rows = queryRows();

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Rounds</p>
        <h1>Every search term, and what it brought in</h1>
        <p className="lede">
          Each round&apos;s terms are committed to the repo before any data is pulled. &ldquo;Contains it&rdquo; is
          the share of pulled posts that really contain the term; the search API also matches typos.
        </p>
      </div>

      {all.map((r) => {
        const terms = rows.filter((q) => q.round_id === r.id);
        return (
          <section key={r.id} className="section" style={{ marginTop: 40 }}>
            <div className="section-head">
              <h2>Round {r.id}</h2>
              <span className="muted">{day(r.started_at)} · {terms.length} terms · {num(r.pulled)} pulled</span>
            </div>
            <p style={{ maxWidth: 760, marginBottom: 16 }}>{r.note}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Stage</th>
                    <th className="num">Source hits</th>
                    <th className="num">Pulled</th>
                    <th className="num">Contains it</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {terms.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/posts?query=${encodeURIComponent(q.id)}&round=${q.round_id}`}><code>{q.q === "*" ? "every post" : q.q}</code></Link>
                      </td>
                      <td className="muted">{q.stage ?? "–"}</td>
                      <td className="num">{num(q.hits_total)}</td>
                      <td className="num">{num(q.hits_pulled)}</td>
                      <td className="num">{pct(q.exact, q.hits_pulled)}</td>
                      <td>
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${q.hits_pulled ? (q.exact / q.hits_pulled) * 100 : 0}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
