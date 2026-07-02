import { NextResponse } from "next/server";
import { buildPosts, getRunStatus, fetchAllItems, actorError } from "@/app/lib/linkedin";
import { isRelevantPost } from "@/lib/relevance-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polled by the client. Returns the run's current status plus every post scraped
// so far, so results stream in progressively while the actor keeps running.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const runId = params.get("runId")?.trim() || "";
  const datasetId = params.get("datasetId")?.trim() || "";
  // The searched phrase — used to drop fuzzy LinkedIn matches that never mention it.
  const keyword = params.get("keyword")?.trim() || "";
  // Extra required terms (one per added keyword box). Only AND-filter when present.
  const andTerms = params.getAll("and").map((t) => t.trim()).filter(Boolean);

  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not set" }, { status: 500 });
  if (!runId || !datasetId) {
    return NextResponse.json({ error: "runId and datasetId are required" }, { status: 400 });
  }

  try {
    const status = await getRunStatus(token, runId);
    const done = status !== "RUNNING" && status !== "READY";

    const rawPosts = await fetchAllItems(token, datasetId);

    // LinkedIn search is fuzzy (matches single words independently), so post-fetch
    // we keep only items that genuinely mention the searched keyword. Empty keyword
    // → skip filtering entirely (return everything as-is).
    const relevantPosts = keyword
      ? rawPosts.filter((p) =>
          isRelevantPost(p.text ?? p.postText ?? p.content ?? "", keyword),
        )
      : rawPosts;

    const posts = buildPosts(relevantPosts, andTerms);

    // Actor sometimes "succeeds" but emits a PROCESSING_ERROR marker instead of
    // posts. Check the original rawPosts (the error marker wouldn't survive the
    // relevance filter). Surface it with a retry hint so the client can re-run.
    const actorErr = posts.length === 0 ? actorError(rawPosts) : null;
    const failed = done && actorErr !== null;

    // Log the COMPLETE failure detail for every failed run — the runId lets you
    // open the exact run in the Apify Console to see the real block reason
    // (CAPTCHA / IP block / PROCESSING_ERROR). Counts confirm the relevance filter
    // isn't silently eating results.
    if (failed) {
      console.error("LinkedIn scrape failure:", {
        runId,
        status,
        actorError: actorErr,
        total_fetched: rawPosts.length,
        total_after_filter: posts.length,
        keyword,
        timestamp: new Date().toISOString(),
      });
    } else if (done) {
      console.log(
        `[apify] linkedin run ${runId} ${status} — keyword="${keyword}" ` +
          `total_fetched=${rawPosts.length} total_after_filter=${posts.length}`,
      );
    }

    return NextResponse.json({
      status,
      done,
      posts,
      failed,
      error: failed ? `LinkedIn scrape failed (${actorErr}). Retrying…` : undefined,
      meta: {
        total_fetched: rawPosts.length,
        total_returned: posts.length,
        filtered_out: rawPosts.length - posts.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[apify] linkedin status failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
