"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Arrow } from "./Arrow";
import type { PostItem } from "@/lib/data";
import { day, num, postHref } from "@/lib/format";

// Filters the published posts in the browser. The filters live in the URL
// (?source=hn&judged=relevant), so links from other pages land pre-filtered.

type Option = { value: string; label: string };
type Filters = { q: string; source: string; stage: string; round: string; judged: string; query: string; page: number };

const EMPTY: Filters = { q: "", source: "", stage: "", round: "", judged: "", query: "", page: 1 };
const PAGE_SIZE = 50;
const JUDGED_LABEL = { 1: "about a pain", 0: "not about a pain" } as const;

function fromUrl(): Filters {
  const p = new URLSearchParams(window.location.search);
  return {
    q: p.get("q")?.slice(0, 200) ?? "",
    source: p.get("source") ?? "",
    stage: p.get("stage") ?? "",
    round: p.get("round") ?? "",
    judged: p.get("judged") ?? "",
    query: p.get("query") ?? "",
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toUrl(f: Filters) {
  const p = new URLSearchParams();
  for (const key of ["q", "source", "stage", "round", "judged", "query"] as const) if (f[key]) p.set(key, f[key]);
  if (f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}

function matches(p: PostItem, f: Filters) {
  if (f.source && p.source !== f.source) return false;
  if (f.stage && !p.stages.includes(f.stage)) return false;
  if (f.round && !p.rounds.includes(Number(f.round))) return false;
  if (f.query && !p.queries.includes(f.query)) return false;
  if (f.judged === "relevant" && p.relevant !== 1) return false;
  if (f.judged === "not-relevant" && p.relevant !== 0) return false;
  if (f.judged === "unjudged" && p.relevant !== null) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!p.excerpt.toLowerCase().includes(q) && !(p.title ?? "").toLowerCase().includes(q)) return false;
  }
  return true;
}

export function PostsBrowser({
  sources,
  stages,
  rounds,
  shortSource,
}: {
  sources: Option[];
  stages: string[];
  rounds: number[];
  shortSource: Record<string, string>;
}) {
  const [all, setAll] = useState<PostItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [f, setF] = useState<Filters>(EMPTY);

  useEffect(() => {
    setF(fromUrl());
    fetch("/posts.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setAll)
      .catch(() => setFailed(true));
  }, []);

  const update = (patch: Partial<Filters>) => {
    const next = { ...f, page: 1, ...patch };
    setF(next);
    toUrl(next);
  };

  const shown = useMemo(() => (all ? all.filter((p) => matches(p, f)) : []), [all, f]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = f.q || f.source || f.stage || f.round || f.judged || f.query;

  return (
    <>
      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          Text
          <input type="search" value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="e.g. waiting on review" />
        </label>
        <label className="field">
          Source
          <select value={f.source} onChange={(e) => update({ source: e.target.value })}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Stage
          <select value={f.stage} onChange={(e) => update({ stage: e.target.value })}>
            <option value="">All</option>
            {stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Round
          <select value={f.round} onChange={(e) => update({ round: e.target.value })}>
            <option value="">All</option>
            {rounds.map((r) => (
              <option key={r} value={r}>Round {r}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Read by hand
          <select value={f.judged} onChange={(e) => update({ judged: e.target.value })}>
            <option value="">Any</option>
            <option value="relevant">About a pain</option>
            <option value="not-relevant">Not about a pain</option>
            <option value="unjudged">Coded only</option>
          </select>
        </label>
        {filtered ? (
          <button type="button" className="text-button" onClick={() => update(EMPTY)}>
            Clear
          </button>
        ) : null}
      </form>

      <p className="muted" style={{ marginBottom: 12 }} aria-live="polite">
        {failed
          ? "The posts didn't load. Try reloading the page."
          : all
            ? <>{num(shown.length)} posts{f.query ? <> matched by <code>{f.query}</code></> : null}</>
            : "Loading posts…"}
      </p>

      {all ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Post</th>
                  <th>Source</th>
                  <th>Read</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{day(r.created)}</td>
                    <td>
                      <Link href={postHref(r.id)} style={{ color: "inherit" }}>
                        <span className="excerpt" style={{ display: "block" }}>{r.excerpt}</span>
                      </Link>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {r.kind} · {r.words} words{r.title ? ` · ${r.title}` : ""}
                      </span>
                    </td>
                    <td>
                      <span className="chips">
                        <span className="chip">{shortSource[r.source] ?? r.source}</span>
                        {r.stages.map((s) => <span key={s} className="chip">{s}</span>)}
                      </span>
                    </td>
                    <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                      {r.relevant === null ? "–" : JUDGED_LABEL[r.relevant]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pager" aria-label="Pages">
            {page > 1 ? (
              <button type="button" className="text-button" onClick={() => update({ page: page - 1 })}>
                <Arrow dir="left" />Newer
              </button>
            ) : <span />}
            <span className="muted">Page {page} of {num(pages)}</span>
            {page < pages ? (
              <button type="button" className="text-button" onClick={() => update({ page: page + 1 })}>
                Older<Arrow />
              </button>
            ) : <span />}
          </nav>
        </>
      ) : null}
    </>
  );
}
