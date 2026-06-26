import type { Post } from "../types";

export const ACTOR_ID = "datadoping~linkedin-posts-search-scraper";
// Max posts to pull per keyword. Apify charges per post returned, not per cap;
// the date range bounds the real count. Override with APIFY_MAX_POSTS.
export const MAX_POSTS = Number(process.env.APIFY_MAX_POSTS) || 2000;
export const PAGE_SIZE = 1000;

interface RawReaction {
  count?: number;
  type?: string;
}

export interface RawPost {
  // The actor sometimes emits an error marker instead of a post when LinkedIn
  // blocks the scrape (e.g. { input, error: "PROCESSING_ERROR", message }).
  input?: string;
  error?: string;
  message?: string;
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
export function dateFilterFromRange(from: string, to: string): string | null {
  if (!from) return null;
  const fromMs = new Date(from).getTime();
  if (Number.isNaN(fromMs)) return null;
  const toMs = to ? new Date(to).getTime() : Date.now();
  const days = (toMs - fromMs) / (24 * 60 * 60 * 1000);
  if (days <= 1.5) return "past-24h";
  if (days <= 8) return "past-week";
  if (days <= 32) return "past-month";
  return null;
}

/** Detect the actor's "couldn't scrape this keyword" error marker. */
export function actorError(rawPosts: RawPost[]): string | null {
  const errItem = rawPosts.find((p) => typeof p.error === "string" && p.error.length > 0);
  return errItem ? errItem.error! : null;
}

/** True if every required term appears (case-insensitive) in the post text. */
export function matchesAllTerms(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term.replace(/^#/, "").toLowerCase()));
}

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

export function normalizePost(p: RawPost): Post {
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

/**
 * Raw posts → normalized Post[]. Drops junk items (no text). Only applies an
 * AND filter when the caller explicitly passed multiple required terms (i.e. the
 * user added extra keyword boxes) — a single search phrase is trusted as-is, not
 * split into words, so real posts aren't thrown away.
 */
export function buildPosts(rawPosts: RawPost[], andTerms: string[] = []): Post[] {
  const withText = rawPosts.filter((p) => (p.text ?? p.postText ?? p.content ?? "").trim().length > 0);
  const filtered =
    andTerms.length > 0
      ? withText.filter((p) => matchesAllTerms(p.text ?? p.postText ?? p.content ?? "", andTerms))
      : withText;
  return filtered.map(normalizePost);
}

export interface ApifyRunInfo {
  id: string;
  status: string;
  defaultDatasetId: string;
}

/** Kick off an async actor run. Returns quickly (run is queued). */
export async function startRun(
  token: string,
  input: Record<string, unknown>,
): Promise<ApifyRunInfo> {
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Apify run start failed (${res.status}): ${body.slice(0, 300)}`);
  const json = JSON.parse(body) as { data: ApifyRunInfo };
  return json.data;
}

/** One-shot run status check (no polling — caller polls). */
export async function getRunStatus(token: string, runId: string): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { data?: { status?: string } };
  return json.data?.status ?? "UNKNOWN";
}

/** Page through a dataset and return every item currently available. */
export async function fetchAllItems(token: string, datasetId: string): Promise<RawPost[]> {
  const all: RawPost[] = [];
  let offset = 0;
  // Cap iterations defensively.
  for (let i = 0; i < 50; i++) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&offset=${offset}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) break;
    const page = (await res.json()) as RawPost[];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
