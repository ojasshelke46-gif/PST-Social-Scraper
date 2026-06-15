"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import PostCard, { IMPRESSIONS_PER_LIKE } from "./PostCard";
import { SearchIcon, HeartIcon, EyeIcon } from "./icons";
import type { Post, PlatformFilter, SortKey } from "./types";
import { useAuth } from "./AuthProvider";

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

// ─── Sign-in screen ──────────────────────────────────────────────────────────

function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  return (
    <div className="auth-gate">
      <div className="auth-card">
        <p className="eyebrow">Social Signal Tracker</p>
        <h1 className="auth-title">Signal, not noise.</h1>
        <p className="auth-sub">
          Sign in with Google to start scraping LinkedIn &amp; X posts.
        </p>
        <button id="google-sign-in-btn" className="google-btn" onClick={signInWithGoogle}>
          <GoogleIcon />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

// ─── User header ─────────────────────────────────────────────────────────────

function UserHeader() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div className="user-header">
      {user.photoURL && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt={user.displayName ?? "User avatar"}
          className="user-avatar"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="user-name">{user.displayName ?? user.email}</span>
      <button id="sign-out-btn" className="sign-out-btn" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

// ─── Google icon SVG ─────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// ─── Fire-and-forget search logger ───────────────────────────────────────────

async function logSearch(payload: {
  name: string;
  email: string;
  keyword: string;
  timestamp: string;
}) {
  try {
    await fetch("/api/log-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[log-search] failed:", err);
  }
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading } = useAuth();

  // Show nothing while Firebase resolves auth state
  if (loading) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <p className="eyebrow">Loading…</p>
        </div>
      </div>
    );
  }

  // Not signed in → show sign-in screen
  if (!user) return <SignInScreen />;

  // Signed in → show scraper
  return <ScraperUI user={user} />;
}

// ─── Scraper UI (extracted so it only renders when signed in) ─────────────────

function ScraperUI({ user }: { user: User }) {
  const [keyword, setKeyword] = useState("");
  const [inputValue, setInputValue] = useState("");
  // Extra search terms — combined with inputValue, all must appear in a post (AND).
  const [extraTerms, setExtraTerms] = useState<{ id: number; value: string }[]>([]);
  const nextTermId = useRef(0);
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
    const term = kw.trim();
    if (!term) return;
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
      const term = [inputValue, ...extraTerms.map((t) => t.value)]
        .map((t) => t.trim())
        .filter(Boolean)
        .join(" ");
      if (!term) return;
      setKeyword(term);
      load(term, dateFrom, dateTo);

      // Fire-and-forget: log the search with user identity
      logSearch({
        name: user.displayName ?? "",
        email: user.email ?? "",
        keyword: term,
        timestamp: new Date().toISOString(),
      });
    },
    [inputValue, extraTerms, dateFrom, dateTo, load, user]
  );

  const addTerm = useCallback(() => {
    setExtraTerms((prev) => [...prev, { id: nextTermId.current++, value: "" }]);
  }, []);

  const updateTerm = useCallback((id: number, value: string) => {
    setExtraTerms((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)));
  }, []);

  const removeTerm = useCallback((id: number) => {
    setExtraTerms((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Date-range controls only update local state — they don't trigger a
  // search. Only the Search button kicks off a fetch.
  const applyQuickRange = useCallback((days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(toDateInput(from));
    setDateTo(toDateInput(to));
    setRangeOpen(false);
  }, []);

  const applyCustomRange = useCallback(() => {
    setRangeOpen(false);
  }, []);

  const clearRange = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setRangeOpen(false);
  }, []);

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

  const totalLikes = useMemo(
    () => visible.reduce((sum, p) => sum + p.likes, 0),
    [visible]
  );

  const totalImpressions = totalLikes * IMPRESSIONS_PER_LIKE;

  const errorEntries = Object.entries(platformErrors);

  return (
    <main className="page">
      <UserHeader />

      <header className="header">
        <p className="eyebrow">Social Signal Tracker</p>
        <h1 className="title">Signal, not noise.</h1>
        <p className="subtitle">
          {keyword ? (
            <>
              LinkedIn &amp; X posts matching <span className="kw">{keyword}</span>, in one feed.
            </>
          ) : (
            "LinkedIn & X posts, in one feed."
          )}
        </p>
      </header>

      <form className="toolbar" onSubmit={handleSearch}>
        <div className="search-group">
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

          {extraTerms.map((t) => (
            <div className="search extra-term" key={t.id}>
              <input
                type="text"
                placeholder="Another keyword (AND)…"
                value={t.value}
                onChange={(e) => updateTerm(t.id, e.target.value)}
                aria-label="Additional search keyword"
              />
              <button
                type="button"
                className="remove-term"
                onClick={() => removeTerm(t.id)}
                aria-label="Remove keyword"
              >
                ×
              </button>
            </div>
          ))}

          <button type="button" className="add-term" onClick={addTerm}>
            + Add keyword
          </button>
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

      {hasSearched && !loading && visible.length > 0 && (
        <div className="stats-hero">
          <div className="stat-card">
            <span className="stat-label">
              <HeartIcon /> Total Likes
            </span>
            <span className="stat-value">{totalLikes.toLocaleString()}</span>
          </div>
          <div className="stat-card stat-card-accent">
            <span className="stat-label">
              <EyeIcon /> Total Impressions
            </span>
            <span className="stat-value">{totalImpressions.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">
              <SearchIcon /> Posts Found
            </span>
            <span className="stat-value">{visible.length}</span>
          </div>
        </div>
      )}

      {hasSearched && (
        <div className="meta-row">
          <span>
            {loading ? "Fetching…" : `Sorted by ${sort === "likes" ? "engagement" : "date"}`}
          </span>
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
          No posts found for <span className="kw">{keyword}</span>.
        </div>
      ) : (
        <div className="feed">
          {visible.map((post) => (
            <PostCard
              key={post.url}
              post={post}
              keyword={keyword}
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
