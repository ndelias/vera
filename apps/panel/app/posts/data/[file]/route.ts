import { all } from "@/lib/db";
import { post, sourceLabel } from "@/lib/data";
import { postIdFromSlug, postSlug } from "@/lib/format";

// One small JSON file per published post, written at build. A single page
// (/posts/view) renders whichever one the URL names, instead of 2,480 pages.
export const dynamicParams = false;

export function generateStaticParams() {
  return all<{ id: string }>(`SELECT id FROM documents WHERE text <> ''`).map(({ id }) => ({ file: `${postSlug(id)}.json` }));
}

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const data = post(postIdFromSlug(file.replace(/\.json$/, "")));
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json({ ...data, sourceLabel: sourceLabel(data.doc.source) });
}
