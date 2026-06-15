import { NextResponse } from "next/server";
import type { Post } from "@/app/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";
const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";
// Endpoint returns ~20 tweets per page; cap how many we keep per search.
const MAX_TWEETS = 10;

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
  has_more?: boolean;
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

  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { platform: "twitter", keyword, posts: [], error: "TWITTERAPI_IO_KEY is not set" },
      { status: 500 },
    );
  }

  const queryType = sort === "recent" ? "Latest" : "Top";

  let query = `"${keyword}"`;
  const fromMs = from ? new Date(from).getTime() : NaN;
  if (!Number.isNaN(fromMs)) {
    query += ` since_time:${Math.floor(fromMs / 1000)}`;
  }

  const url = `${ENDPOINT}?${new URLSearchParams({ query, queryType })}`;

  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      console.error(`[twitterapi.io] search failed (${res.status}): ${bodyText.slice(0, 1000)}`);
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
      console.error(`[twitterapi.io] search returned non-JSON: ${bodyText.slice(0, 1000)}`);
      return NextResponse.json(
        { platform: "twitter", keyword, posts: [], error: "TwitterAPI.io returned non-JSON response" },
        { status: 502 },
      );
    }

    const tweets = data.tweets ?? [];
    if (tweets[0]) {
      console.log(`[twitterapi.io] first tweet: ${JSON.stringify(tweets[0], null, 2)}`);
    }

    const posts = tweets.slice(0, MAX_TWEETS).map(normalizeTweet);

    return NextResponse.json({ platform: "twitter", keyword, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[twitterapi.io] search threw: ${message}`);
    return NextResponse.json({ platform: "twitter", keyword, posts: [], error: message }, { status: 502 });
  }
}
