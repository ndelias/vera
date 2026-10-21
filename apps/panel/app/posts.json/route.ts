import { publishedPosts } from "@/lib/data";

// Written once at build; the Posts page filters it in the browser.
export const dynamic = "force-static";

export function GET() {
  return Response.json(publishedPosts());
}
