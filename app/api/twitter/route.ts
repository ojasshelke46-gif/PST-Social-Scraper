import { NextResponse } from "next/server";
import { searchAnakin, AnakinError } from "@/lib/anakin";
import type { Post } from "@/app/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";

/**
 * Derive a readable author from an X/Twitter status URL.
 * x.com/{handle}/status/{id}  ->  "@{handle}". Falls back to the result title.
 */
function authorFromUrl(url: string, fallback: string): string {
  const m = url.match(/(?:x|twitter)\.com\/([^/]+)\/status\//i);
  if (!m || !m[1]) return fallback;
  return `@${m[1]}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim() || DEFAULT_KEYWORD;
  const from = params.get("from")?.trim() || "";
  const to = params.get("to")?.trim() || "";

  // Parse the date-range bounds once. "to" is inclusive of the whole day.
  const fromMs = from ? new Date(from).getTime() : NaN;
  const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : NaN;

  try {
    // Quoted phrase first (precise); if nothing indexed, retry unquoted (broader).
    let results = await searchAnakin(`site:x.com "${keyword}"`);
    console.log(`[twitter] search "${keyword}" (quoted) -> ${results.length} results`);
    if (results.length === 0) {
      results = await searchAnakin(`site:x.com ${keyword}`);
      console.log(`[twitter] search ${keyword} (unquoted) -> ${results.length} results`);
    }

    const inRange = (dateStr?: string): boolean => {
      if (Number.isNaN(fromMs) && Number.isNaN(toMs)) return true;
      const t = new Date(dateStr ?? "").getTime();
      if (Number.isNaN(t)) return false;
      if (!Number.isNaN(fromMs) && t < fromMs) return false;
      if (!Number.isNaN(toMs) && t > toMs) return false;
      return true;
    };

    const withUrl = results.filter((r) => r.url);
    // Apply the date range; if it filters everything out, fall back to all
    // results so the feed never goes empty just because the index is sparse.
    const ranged = withUrl.filter((r) => inRange(r.date));
    const chosen = ranged.length > 0 ? ranged : withUrl;

    const posts: Post[] = chosen
      // Newest first so stale posts don't lead.
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .map((r) => ({
        platform: "twitter",
        author: authorFromUrl(r.url, r.title?.trim() || "Unknown"),
        text: r.snippet?.trim() || r.title?.trim() || "",
        likes: 0,
        url: r.url,
        date: r.date?.trim() || new Date().toISOString(),
      }));

    return NextResponse.json({ platform: "twitter", keyword, posts });
  } catch (err) {
    const status = err instanceof AnakinError ? err.status ?? 502 : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ platform: "twitter", keyword, posts: [], error: message }, { status });
  }
}
