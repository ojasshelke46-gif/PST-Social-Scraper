import { NextResponse } from "next/server";
import type { Post } from "@/app/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";
const ACTOR_ID = "datadoping~linkedin-posts-search-scraper";
// Posts to request per keyword. Free tier caps at 50; on a paid Apify plan
// raise APIFY_MAX_POSTS to pull more candidates for the AND-term filter.
const MAX_POSTS = Number(process.env.APIFY_MAX_POSTS) || 50;

interface RawReaction {
  count?: number;
  type?: string;
}

interface RawPost {
  author?: { name?: string; image_url?: string };
  text?: string;
  postText?: string;
  content?: string;
  post_url?: string;
  postUrl?: string;
  url?: string;
  total_reactions?: number;
  totalReactions?: number;
  likes?: number;
  reaction_count?: number;
  stats?: { total_reactions?: number; reactions?: RawReaction[] };
  reactions?: RawReaction[] | { total?: number };
  posted_at?: { date?: string; display_text?: string; timestamp?: number };
  postedAt?: string;
  date?: string;
  timestamp?: number;
}

/** Map a UI date range (from/to) onto the actor's date_filter buckets. */
function dateFilterFromRange(from: string, to: string): string | null {
  if (!from) return null;
  const fromMs = new Date(from).getTime();
  if (Number.isNaN(fromMs)) return null;
  const toMs = to ? new Date(to).getTime() : Date.now();
  const days = (toMs - fromMs) / (24 * 60 * 60 * 1000);
  if (days <= 1.5) return "past-24h";
  if (days <= 8) return "past-week";
  if (days <= 32) return "past-month";
  return null; // wider than a month — let the actor return anything
}

/**
 * Split a multi-word search into individual terms (hashtags' "#" stripped),
 * so "polaris fellowship internship" requires ALL three to appear in a post.
 */
function searchTerms(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((w) => w.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
}

/** True if every search term appears (case-insensitive, hashtag-or-not) in the post text. */
function matchesAllTerms(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Pull a likes count out of a raw post, trying every known shape. Null if absent. */
function likesFrom(p: RawPost): number | null {
  if (typeof p.total_reactions === "number") return p.total_reactions;
  if (typeof p.totalReactions === "number") return p.totalReactions;
  if (typeof p.stats?.total_reactions === "number") return p.stats.total_reactions;
  if (typeof p.likes === "number") return p.likes;
  if (typeof p.reaction_count === "number") return p.reaction_count;

  const reactionsArr = Array.isArray(p.reactions)
    ? p.reactions
    : Array.isArray(p.stats?.reactions)
      ? p.stats!.reactions
      : null;
  if (reactionsArr) {
    return reactionsArr.reduce((sum, r) => sum + (typeof r.count === "number" ? r.count : 0), 0);
  }
  if (!Array.isArray(p.reactions) && typeof p.reactions?.total === "number") return p.reactions.total;

  return null;
}

function normalizePost(p: RawPost): Post {
  const author = p.author?.name ?? "Unknown";
  const avatar = p.author?.image_url || undefined;
  const text = p.text ?? p.postText ?? p.content ?? "";
  const url = p.post_url ?? p.postUrl ?? p.url ?? "#";

  const dateRaw = p.posted_at?.date ?? p.postedAt ?? p.date ?? null;
  const timestamp = p.posted_at?.timestamp ?? p.timestamp ?? null;
  const date = dateRaw
    ? new Date(dateRaw.replace(" ", "T") + "Z").toISOString()
    : timestamp
      ? new Date(timestamp).toISOString()
      : new Date().toISOString();

  const likes = likesFrom(p);

  return {
    platform: "linkedin",
    author,
    avatar,
    text,
    url,
    date,
    likes: likes ?? 0,
    likesUnavailable: likes === null,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim() || DEFAULT_KEYWORD;
  const sort = params.get("sort") || "top";
  const from = params.get("from")?.trim() || "";
  const to = params.get("to")?.trim() || "";

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { platform: "linkedin", keyword, posts: [], error: "APIFY_TOKEN is not set" },
      { status: 500 },
    );
  }

  const input: Record<string, unknown> = {
    keywords: [keyword],
    max_posts: MAX_POSTS,
    sort_by: sort === "recent" ? "date_posted" : "relevance",
  };
  const dateFilter = dateFilterFromRange(from, to);
  if (dateFilter) input.date_filter = dateFilter;

  const endpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      console.error(`[apify] linkedin actor failed (${res.status}): ${bodyText.slice(0, 1000)}`);
      return NextResponse.json(
        { platform: "linkedin", keyword, posts: [], error: `Apify actor failed (${res.status})` },
        { status: 502 },
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(bodyText);
    } catch {
      console.error(`[apify] linkedin actor returned non-JSON: ${bodyText.slice(0, 1000)}`);
      return NextResponse.json(
        { platform: "linkedin", keyword, posts: [], error: "Apify returned non-JSON response" },
        { status: 502 },
      );
    }

    const rawPosts: RawPost[] = Array.isArray(data) ? (data as RawPost[]) : [];

    // Multi-word search: only keep posts whose text contains every term.
    const terms = searchTerms(keyword);
    const filtered =
      terms.length > 1
        ? rawPosts.filter((p) => matchesAllTerms(p.text ?? p.postText ?? p.content ?? "", terms))
        : rawPosts;

    const posts = filtered.map(normalizePost);

    return NextResponse.json({ platform: "linkedin", keyword, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[apify] linkedin actor threw: ${message}`);
    return NextResponse.json(
      { platform: "linkedin", keyword, posts: [], error: message },
      { status: 502 },
    );
  }
}
