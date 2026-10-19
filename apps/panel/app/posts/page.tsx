import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Arrow";
import { PAGE_SIZE, STAGE_ORDER, posts, rounds, type PostFilters } from "@/lib/data";
import { day, num } from "@/lib/format";

export const metadata: Metadata = { title: "Posts" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function readFilters(sp: Search): PostFilters {
  const judged = first(sp.judged);
  return {
    q: first(sp.q)?.slice(0, 200),
    stage: STAGE_ORDER.includes(first(sp.stage) as never) ? first(sp.stage) : undefined,
    round: Number(first(sp.round)) || undefined,
    query: first(sp.query),
    judged: judged === "relevant" || judged === "not-relevant" || judged === "unjudged" ? judged : undefined,
    page: Math.max(1, Number(first(sp.page)) || 1),
  };
}

function hrefWith(f: PostFilters, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.stage) p.set("stage", f.stage);
  if (f.round) p.set("round", String(f.round));
  if (f.query) p.set("query", f.query);
  if (f.judged) p.set("judged", f.judged);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/posts?${s}` : "/posts";
}

const JUDGED_LABEL = { 1: "about a pain", 0: "not about a pain" } as const;

export default async function Posts({ searchParams }: { searchParams: Promise<Search> }) {
  const f = readFilters(await searchParams);
  const { rows, total } = posts(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Corpus</p>
        <h1>Posts</h1>
        <p className="lede">
          Every post in the corpus, newest first. Filter by stage, round or search term, or by whether it was
          read and judged to be about a pain.
        </p>
      </div>

      <form className="filters" method="get" action="/posts" role="search">
        <label className="field">
          Text
          <input type="search" name="q" defaultValue={f.q ?? ""} placeholder="e.g. waiting on review" />
        </label>
        <label className="field">
          Stage
          <select name="stage" defaultValue={f.stage ?? ""}>
            <option value="">All</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Round
          <select name="round" defaultValue={f.round ?? ""}>
            <option value="">All</option>
            {rounds().map((r) => (
              <option key={r.id} value={r.id}>Round {r.id}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Read by hand
          <select name="judged" defaultValue={f.judged ?? ""}>
            <option value="">Any</option>
            <option value="relevant">About a pain</option>
            <option value="not-relevant">Not about a pain</option>
            <option value="unjudged">Not read</option>
          </select>
        </label>
        {f.query ? <input type="hidden" name="query" value={f.query} /> : null}
        <button className="button" type="submit">Filter</button>
        {f.q || f.stage || f.round || f.query || f.judged ? <Link href="/posts">Clear</Link> : null}
      </form>

      <p className="muted" style={{ marginBottom: 12 }}>
        {num(total)} posts{f.query ? <> matched by <code>{f.query}</code></> : null}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Post</th>
              <th>Stage</th>
              <th>Read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{day(r.created_at)}</td>
                <td>
                  <Link href={`/posts/${encodeURIComponent(r.id)}`} style={{ color: "inherit" }}>
                    <span className="excerpt" style={{ display: "block" }}>
                      {r.excerpt}
                      {r.truncated ? "…" : ""}
                    </span>
                  </Link>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {r.kind} · {r.words} words{r.title ? ` · ${r.title}` : ""}
                  </span>
                </td>
                <td>
                  <span className="chips">
                    {r.stages?.split(",").map((s) => <span key={s} className="chip">{s}</span>)}
                  </span>
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                  {r.relevant === null ? "–" : JUDGED_LABEL[r.relevant as 0 | 1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="pager" aria-label="Pages">
        {f.page > 1 ? <Link href={hrefWith(f, f.page - 1)}><Arrow dir="left" />Newer</Link> : <span />}
        <span className="muted">Page {f.page} of {num(pages)}</span>
        {f.page < pages ? <Link href={hrefWith(f, f.page + 1)}>Older<Arrow /></Link> : <span />}
      </nav>
    </>
  );
}
