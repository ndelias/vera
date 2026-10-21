import type { Metadata } from "next";
import { PostsBrowser } from "@/components/PostsBrowser";
import { SOURCES, STAGE_ORDER, overview, rounds } from "@/lib/data";
import { num } from "@/lib/format";
import { one } from "@/lib/db";

export const metadata: Metadata = { title: "Posts" };

export default function Posts() {
  const o = overview();
  const published = one<{ n: number }>(`SELECT COUNT(*) AS n FROM documents WHERE text <> ''`)!.n;

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Corpus</p>
        <h1>Posts</h1>
        <p className="lede">
          The {num(published)} posts that were read or coded, newest first, as short excerpts with links to the
          originals. The other {num(o.corpus - published)} posts in the corpus were counted, not republished: the words
          are other people&apos;s.
        </p>
      </div>
      <PostsBrowser
        sources={SOURCES.map((s) => ({ value: s.key, label: s.label }))}
        shortSource={Object.fromEntries(SOURCES.map((s) => [s.key, s.short]))}
        stages={[...STAGE_ORDER]}
        rounds={rounds().map((r) => r.id)}
      />
    </>
  );
}
