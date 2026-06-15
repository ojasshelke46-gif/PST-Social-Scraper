"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import PostCard from "./PostCard";
import { SearchIcon } from "./icons";
import type { Post, PlatformFilter, SortKey } from "./types";

const DEFAULT_KEYWORD = process.env.NEXT_PUBLIC_DEFAULT_KEYWORD || "Next.js";

const PLATFORM_TABS: { key: PlatformFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "twitter", label: "X" },
];

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: "likes", label: "Top" },
  { key: "date", label: "Recent" },
];

interface PostsResponse {
  keyword: string;
  posts: Post[];
  errors?: Record<string, string>;
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  const [keyword, setKeyword] = useState(DEFAULT_KEYWORD);
  const [inputValue, setInputValue] = useState(DEFAULT_KEYWORD);
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [sort, setSort] = useState<SortKey>("likes");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [platformErrors, setPlatformErrors] = useState<Record<string, string>>({});

  // Track the in-flight request so stale responses don't overwrite fresh ones.
  const reqId = useRef(0);

  const load = useCallback(async (kw: string, from?: string, to?: string) => {
    const term = kw.trim() || DEFAULT_KEYWORD;
    const id = ++reqId.current;
    setLoading(true);
    setHasSearched(true);
    setFetchError(null);
    try {
      const qs = new URLSearchParams({ keyword: term });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/posts?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as PostsResponse;
      if (id !== reqId.current) return; // a newer request superseded this one
      setPosts(data.posts ?? []);
      setPlatformErrors(data.errors ?? {});
    } catch (err) {
      if (id !== reqId.current) return;
      setFetchError(err instanceof Error ? err.message : "Failed to load posts");
      setPosts([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const term = inputValue.trim() || DEFAULT_KEYWORD;
      setKeyword(term);
      load(term, dateFrom, dateTo);
    },
    [inputValue, dateFrom, dateTo, load]
  );

  const applyQuickRange = useCallback(
    (days: number) => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const fromStr = toDateInput(from);
      const toStr = toDateInput(to);
      setDateFrom(fromStr);
      setDateTo(toStr);
      setRangeOpen(false);
      const term = inputValue.trim() || DEFAULT_KEYWORD;
      setKeyword(term);
      load(term, fromStr, toStr);
    },
    [inputValue, load]
  );

  const applyCustomRange = useCallback(() => {
    setRangeOpen(false);
    const term = inputValue.trim() || DEFAULT_KEYWORD;
    setKeyword(term);
    load(term, dateFrom, dateTo);
  }, [inputValue, dateFrom, dateTo, load]);

  const clearRange = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setRangeOpen(false);
    const term = inputValue.trim() || DEFAULT_KEYWORD;
    setKeyword(term);
    load(term);
  }, [inputValue, load]);

  const visible = useMemo(() => {
    return posts
      .filter((p) => platform === "all" || p.platform === platform)
      .sort((a, b) =>
        sort === "likes"
          ? b.likes - a.likes
          : new Date(b.date).getTime() - new Date(a.date).getTime()
      );
  }, [posts, platform, sort]);

  const maxLikes = useMemo(
    () => visible.reduce((m, p) => Math.max(m, p.likes), 0),
    [visible]
  );

  const errorEntries = Object.entries(platformErrors);

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">Social Signal Tracker</p>
        <h1 className="title">Signal, not noise.</h1>
        <p className="subtitle">
          LinkedIn &amp; X posts matching <span className="kw">{keyword || DEFAULT_KEYWORD}</span>,
          in one feed.
        </p>
      </header>

      <form className="toolbar" onSubmit={handleSearch}>
        <div className="search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search a keyword across LinkedIn & X…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            aria-label="Search keyword"
          />
        </div>

        <button type="submit" className="search-btn">
          Search
        </button>

        <div className="range-wrap">
          <button
            type="button"
            className="range-btn"
            data-active={Boolean(dateFrom || dateTo)}
            onClick={() => setRangeOpen((v) => !v)}
          >
            {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "Date range"}
          </button>

          {rangeOpen && (
            <div className="range-pop">
              <div className="range-quick">
                <button type="button" onClick={() => applyQuickRange(1)}>
                  1 day
                </button>
                <button type="button" onClick={() => applyQuickRange(7)}>
                  7 day
                </button>
              </div>

              <div className="range-fields">
                <label>
                  From
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </label>
              </div>

              <div className="range-actions">
                <button type="button" className="range-clear" onClick={clearRange}>
                  Clear
                </button>
                <button type="button" className="range-apply" onClick={applyCustomRange}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="segment" role="group" aria-label="Filter by platform">
          {PLATFORM_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              data-active={platform === t.key}
              onClick={() => setPlatform(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="segment" role="group" aria-label="Sort posts">
          {SORT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="accent"
              data-active={sort === t.key}
              onClick={() => setSort(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </form>

      {errorEntries.length > 0 && (
        <div className="banner" role="alert">
          {errorEntries.map(([plat, msg]) => (
            <span key={plat}>
              <strong>{plat === "twitter" ? "X" : "LinkedIn"}:</strong> {msg}
            </span>
          ))}
        </div>
      )}

      {hasSearched && (
        <div className="meta-row">
          <span>
            {loading ? "Fetching…" : `Sorted by ${sort === "likes" ? "engagement" : "date"}`}
          </span>
          {!loading && (
            <span className="count">
              {visible.length} {visible.length === 1 ? "post" : "posts"}
            </span>
          )}
        </div>
      )}

      {!hasSearched ? (
        <div className="empty">
          Enter a keyword and hit <span className="kw">Search</span> to start scraping.
        </div>
      ) : loading ? (
        <div className="feed">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : fetchError ? (
        <div className="empty error">
          <p>Couldn&apos;t load the feed.</p>
          <p className="dim">{fetchError}</p>
          <button className="retry" onClick={() => load(keyword)}>
            Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          No posts found for <span className="kw">{keyword || DEFAULT_KEYWORD}</span>.
        </div>
      ) : (
        <div className="feed">
          {visible.map((post) => (
            <PostCard
              key={post.url}
              post={post}
              keyword={keyword || DEFAULT_KEYWORD}
              maxLikes={maxLikes}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function SkeletonCard() {
  return (
    <article className="card skeleton" aria-hidden="true">
      <div className="card-head">
        <span className="sk sk-badge" />
        <span className="sk sk-author" />
      </div>
      <span className="sk sk-line" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
      <div className="engagement">
        <span className="sk sk-likes" />
        <span className="sk sk-bar" />
      </div>
    </article>
  );
}
