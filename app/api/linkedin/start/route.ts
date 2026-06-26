import { NextResponse } from "next/server";
import { ACTOR_ID, MAX_POSTS, dateFilterFromRange, startRun } from "@/app/lib/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";

// Kicks off the Apify run and returns its id + dataset id right away. The client
// then polls /api/linkedin/status to stream results in — keeps every request
// short so it never trips a serverless function timeout.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim() || DEFAULT_KEYWORD;
  const sort = params.get("sort") || "top";
  const from = params.get("from")?.trim() || "";
  const to = params.get("to")?.trim() || "";

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN is not set" }, { status: 500 });
  }

  const input: Record<string, unknown> = {
    keywords: [keyword],
    max_posts: MAX_POSTS,
    sort_by: sort === "recent" ? "date_posted" : "relevance",
  };
  const dateFilter = dateFilterFromRange(from, to);
  if (dateFilter) input.date_filter = dateFilter;

  try {
    const run = await startRun(token, input);
    console.log(`[apify] linkedin run started ${run.id} (actor ${ACTOR_ID})`);
    return NextResponse.json({ runId: run.id, datasetId: run.defaultDatasetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[apify] linkedin start failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
