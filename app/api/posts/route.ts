import { NextResponse } from "next/server";
import type { Post } from "@/app/types";

export const dynamic = "force-dynamic";
// Mirrors the sub-route limits — both LinkedIn/X scrapes run concurrently.
export const maxDuration = 300;

interface PlatformResponse {
  posts?: Post[];
  error?: string;
}

async function fetchPlatform(origin: string, platform: string, qs: string): Promise<PlatformResponse> {
  try {
    const res = await fetch(`${origin}/api/${platform}?${qs}`, { cache: "no-store" });
    return (await res.json()) as PlatformResponse;
  } catch (err) {
    return { posts: [], error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim() || process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();

  const qs = new URLSearchParams({ keyword });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  // Both platform routes run concurrently; one failing doesn't sink the other.
  const [linkedin, twitter] = await Promise.all([
    fetchPlatform(url.origin, "linkedin", qs.toString()),
    fetchPlatform(url.origin, "twitter", qs.toString()),
  ]);

  const posts: Post[] = [...(linkedin.posts ?? []), ...(twitter.posts ?? [])].sort(
    (a, b) => b.likes - a.likes,
  );

  const errors: Record<string, string> = {};
  if (linkedin.error) errors.linkedin = linkedin.error;
  if (twitter.error) errors.twitter = twitter.error;

  return NextResponse.json({
    keyword,
    posts,
    errors: Object.keys(errors).length ? errors : undefined,
  });
}
