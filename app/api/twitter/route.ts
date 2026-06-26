import { NextResponse } from "next/server";
import type { Post } from "@/app/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";
const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";
// Max tweets to pull per search. Set high so we page through EVERY tweet in the
// window (exact count, not truncated). Billed per tweet returned. Override with
// TWITTERAPI_MAX_TWEETS. The date range bounds how many actually exist.
const MAX_TWEETS = Number(process.env.TWITTERAPI_MAX_TWEETS) || 2000;
// Safety cap on page requests so a runaway never loops forever (~20 tweets/page).
const MAX_PAGES = 200;
// Overall time budget, kept under maxDuration.
const BUDGET_MS = 110_000;

interface RawTweetAuthor {
  name?: string;
  userName?: string;
}

interface RawTweet {
  author?: RawTweetAuthor;
  text?: string;
  likeCount?: number;
  url?: string;
  twitterUrl?: string;
  createdAt?: string;
}

interface RawSearchResponse {
  tweets?: RawTweet[];
  has_next_page?: boolean;
  next_cursor?: string;
}

function normalizeTweet(tweet: RawTweet): Post {
  return {
    platform: "twitter",
    author: tweet.author?.name ?? tweet.author?.userName ?? "Unknown",
    text: tweet.text ?? "",
    likes: tweet.likeCount ?? 0,
    url: tweet.url ?? tweet.twitterUrl ?? "#",
    date: tweet.createdAt ?? new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim() || DEFAULT_KEYWORD;
  const sort = params.get("sort") || "top";
  const from = params.get("from")?.trim() || "";
  const to = params.get("to")?.trim() || "";
  // Extra required terms (one per added keyword box). Only AND-filter when present.
  const andTerms = params.getAll("and").map((t) => t.trim()).filter(Boolean);

  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { platform: "twitter", keyword, posts: [], error: "TWITTERAPI_IO_KEY is not set" },
      { status: 500 },
    );
  }

  const queryType = sort === "recent" ? "Latest" : "Top";

  // Bound the search to the date window with since_time / until_time (unix secs).
  let query = `"${keyword}"`;
  const fromMs = from ? new Date(from).getTime() : NaN;
  if (!Number.isNaN(fromMs)) query += ` since_time:${Math.floor(fromMs / 1000)}`;
  const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : NaN; // inclusive end-of-day
  if (!Number.isNaN(toMs)) query += ` until_time:${Math.floor(toMs / 1000)}`;

  const deadline = Date.now() + BUDGET_MS;

  try {
    const all: RawTweet[] = [];
    let cursor = "";
    let pages = 0;
    let loggedFirst = false;

    while (pages < MAX_PAGES && all.length < MAX_TWEETS && Date.now() < deadline) {
      const qs = new URLSearchParams({ query, queryType });
      if (cursor) qs.set("cursor", cursor);

      const res = await fetch(`${ENDPOINT}?${qs}`, {
        headers: { "X-API-Key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });

      const bodyText = await res.text();

      if (!res.ok) {
        console.error(`[twitterapi.io] search failed (${res.status}): ${bodyText.slice(0, 1000)}`);
        // If we already gathered some tweets, return those instead of failing.
        if (all.length > 0) break;
        const error =
          res.status === 401
            ? "TWITTERAPI_IO_KEY is missing or invalid"
            : `TwitterAPI.io search failed (${res.status})`;
        return NextResponse.json({ platform: "twitter", keyword, posts: [], error }, { status: 502 });
      }

      let data: RawSearchResponse;
      try {
        data = JSON.parse(bodyText) as RawSearchResponse;
      } catch {
        console.error(`[twitterapi.io] non-JSON page: ${bodyText.slice(0, 500)}`);
        if (all.length > 0) break;
        return NextResponse.json(
          { platform: "twitter", keyword, posts: [], error: "TwitterAPI.io returned non-JSON response" },
          { status: 502 },
        );
      }

      const tweets = data.tweets ?? [];
      if (!loggedFirst && tweets[0]) {
        console.log(`[twitterapi.io] first tweet: ${JSON.stringify(tweets[0], null, 2)}`);
        loggedFirst = true;
      }
      all.push(...tweets);
      pages += 1;

      // Stop when the API says there's no next page or returns an empty page.
      if (!data.has_next_page || !data.next_cursor || tweets.length === 0) break;
      cursor = data.next_cursor;
    }

    console.log(`[twitterapi.io] pulled ${all.length} tweets across ${pages} page(s)`);

    // Only keep tweets containing every explicitly-added keyword (AND).
    const filtered =
      andTerms.length > 0
        ? all.filter((t) => {
            const text = (t.text ?? "").toLowerCase();
            return andTerms.every((term) => text.includes(term.replace(/^#/, "").toLowerCase()));
          })
        : all;

    const posts = filtered.slice(0, MAX_TWEETS).map(normalizeTweet);

    return NextResponse.json({ platform: "twitter", keyword, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[twitterapi.io] search threw: ${message}`);
    return NextResponse.json({ platform: "twitter", keyword, posts: [], error: message }, { status: 502 });
  }
}
