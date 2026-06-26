import { NextResponse } from "next/server";
import { buildPosts, getRunStatus, fetchAllItems, actorError } from "@/app/lib/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polled by the client. Returns the run's current status plus every post scraped
// so far, so results stream in progressively while the actor keeps running.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const runId = params.get("runId")?.trim() || "";
  const datasetId = params.get("datasetId")?.trim() || "";
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
    const posts = buildPosts(rawPosts, andTerms);

    // Actor sometimes "succeeds" but emits a PROCESSING_ERROR marker instead of
    // posts. Surface that (with a retry hint) so the client can re-run.
    const actorErr = posts.length === 0 ? actorError(rawPosts) : null;
    const failed = done && actorErr !== null;

    return NextResponse.json({
      status,
      done,
      posts,
      failed,
      error: failed ? `LinkedIn scrape failed (${actorErr}). Retrying…` : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[apify] linkedin status failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
