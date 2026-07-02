"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import PostCard, { IMPRESSIONS_PER_LIKE } from "./PostCard";
import { SearchIcon, HeartIcon, EyeIcon } from "./icons";
import type { Post, PlatformFilter, SortKey } from "./types";
import { useAuth } from "./AuthProvider";
import { exportToCSV, exportToPDF } from "./lib/export";

const PLATFORM_TABS: { key: PlatformFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "twitter", label: "X" },
];

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: "likes", label: "Top" },
  { key: "date", label: "Recent" },
];

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function CsvIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h1a2 2 0 0 1 0 4H9v-4z" />
      <path d="M15 13h2" />
      <path d="M15 17h2" />
    </svg>
  );
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

  // Default the range to the last 7 days; a search with no manual change
  // scrapes the past week. Changing the dates overrides this.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateInput(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateInput(new Date()));
  const [rangeOpen, setRangeOpen] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  // Platforms whose fetch is still in flight (for progressive rendering).
  const [pending, setPending] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [platformErrors, setPlatformErrors] = useState<Record<string, string>>({});
  const [csvExporting, setCsvExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  // Track the in-flight request so stale responses don't overwrite fresh ones.
  const reqId = useRef(0);

  const load = useCallback(
    async (kw: string, from?: string, to?: string, andTerms: string[] = []) => {
    const term = kw.trim();
    if (!term) return;
    const id = ++reqId.current;
    setLoading(true);
    setPending(["twitter", "linkedin"]);
    setHasSearched(true);
    setFetchError(null);
    setPosts([]);
    setPlatformErrors({});

    const qs = new URLSearchParams({ keyword: term });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    // Each added keyword box becomes a required AND term. A single box sends none,
    // so a plain phrase search is trusted as-is (no over-strict word filtering).
    for (const t of andTerms) qs.append("and", t);

    const stale = () => id !== reqId.current;
    const donePlatform = (platform: string) => {
      if (!stale()) setPending((prev) => prev.filter((p) => p !== platform));
    };
    const mergePosts = (platform: string, list: Post[]) =>
      setPosts((prev) => [...prev.filter((p) => p.platform !== platform), ...list]);
    const setErr = (platform: string, msg: string) =>
      setPlatformErrors((prev) => ({ ...prev, [platform]: msg }));

    // LinkedIn posts are unioned (deduped by URL) across every poll AND across an
    // adaptive re-run, so a later low-yield poll/run can only ADD posts, never
    // shrink what's already shown.
    const linkedinSeen = new Map<string, Post>();
    const mergeLinkedIn = (list: Post[]) => {
      for (const p of list) linkedinSeen.set(p.url || JSON.stringify(p).slice(0, 80), p);
      mergePosts("linkedin", Array.from(linkedinSeen.values()));
    };

    // X/Twitter is fast — one request.
    const fetchTwitter = async () => {
      try {
        const res = await fetch(`/api/twitter?${qs}`, { cache: "no-store" });
        const data = (await res.json()) as { posts?: Post[]; error?: string };
        if (stale()) return;
        if (data.posts?.length) mergePosts("twitter", data.posts);
        if (data.error) setErr("twitter", data.error);
      } catch (err) {
        if (!stale()) setErr("twitter", err instanceof Error ? err.message : "Failed to load");
      } finally {
        donePlatform("twitter");
      }
    };

    // One LinkedIn run: start the Apify actor, poll until done. `outcome` is
    // "failed" when the actor emits a PROCESSING_ERROR (LinkedIn blocked the
    // scrape); `rawYield` is the actor's raw item count (before filtering) so the
    // caller can decide whether the run came back suspiciously low.
    const runLinkedInOnce = async (): Promise<{
      outcome: "ok" | "failed" | "stop";
      rawYield: number;
    }> => {
      const sres = await fetch(`/api/linkedin/start?${qs}`, { cache: "no-store" });
      const s = (await sres.json()) as { runId?: string; datasetId?: string; error?: string };
      if (stale()) return { outcome: "stop", rawYield: 0 };
      if (s.error || !s.runId || !s.datasetId) {
        setErr("linkedin", s.error || "Failed to start LinkedIn scrape");
        return { outcome: "failed", rawYield: 0 };
      }

      const pollDeadline = Date.now() + 290_000;
      const statusQs = `${qs}&runId=${s.runId}&datasetId=${s.datasetId}`;
      let rawYield = 0;
      while (Date.now() < pollDeadline) {
        await new Promise((r) => setTimeout(r, 3000));
        if (stale()) return { outcome: "stop", rawYield };
        const pres = await fetch(`/api/linkedin/status?${statusQs}`, { cache: "no-store" });
        const p = (await pres.json()) as {
          done?: boolean;
          failed?: boolean;
          posts?: Post[];
          error?: string;
          meta?: { total_fetched?: number };
        };
        if (stale()) return { outcome: "stop", rawYield };
        if (p.posts?.length) mergeLinkedIn(p.posts);
        if (typeof p.meta?.total_fetched === "number") rawYield = p.meta.total_fetched;
        if (p.failed) return { outcome: "failed", rawYield };
        if (p.done) return { outcome: "ok", rawYield };
      }
      return { outcome: "ok", rawYield };
    };

    // LinkedIn is slow AND flaky: the actor sometimes returns PROCESSING_ERROR,
    // and even on success its raw yield swings wildly run-to-run (measured 1–485
    // for the same query). Two safeguards:
    //  1. On PROCESSING_ERROR → retry with backoff (transient block self-heals).
    //  2. On a suspiciously low successful yield → run ONCE more and merge unique
    //     results (deduped by URL). This is deliberately adaptive, not a fixed
    //     3×: healthy runs (hundreds of posts) never pay for a second run, and a
    //     low-yield run is cheap to re-run precisely because it returned few
    //     posts. Testing showed a 3rd run adds ~0 unique, so we cap the merge
    //     re-run at 1.
    const LOW_YIELD_FLOOR = 100;
    const fetchLinkedIn = async () => {
      try {
        let mergeRetriesUsed = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { outcome, rawYield } = await runLinkedInOnce();
          if (outcome === "stop") return;
          if (stale()) return;

          if (outcome === "ok") {
            if (rawYield < LOW_YIELD_FLOOR && mergeRetriesUsed < 1 && attempt < 3) {
              mergeRetriesUsed++;
              setErr("linkedin", "Low result count — running once more for completeness…");
              await new Promise((r) => setTimeout(r, 3000));
              continue;
            }
            if (!stale()) setErr("linkedin", "");
            return;
          }

          // outcome === "failed"
          if (attempt < 3) {
            // Exponential backoff (2s, then 4s) — the failure is usually a
            // transient LinkedIn-side block, so don't hammer it back-to-back.
            const backoffMs = 2000 * 2 ** (attempt - 1);
            setErr("linkedin", `LinkedIn scrape failed — retrying (${attempt}/2)…`);
            await new Promise((r) => setTimeout(r, backoffMs));
          } else {
            setErr("linkedin", "LinkedIn scrape failed after retries. Try again in a moment.");
          }
        }
      } catch (err) {
        if (!stale()) setErr("linkedin", err instanceof Error ? err.message : "Failed to load");
      } finally {
        donePlatform("linkedin");
      }
    };

    await Promise.allSettled([fetchTwitter(), fetchLinkedIn()]);
    if (!stale()) setLoading(false);
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const boxes = [inputValue, ...extraTerms.map((t) => t.value)]
        .map((t) => t.trim())
        .filter(Boolean);
      if (!boxes.length) return;
      const term = boxes.join(" ");
      // AND-filter only when the user added 2+ keyword boxes.
      const andTerms = boxes.length >= 2 ? boxes : [];
      setKeyword(term);
      load(term, dateFrom, dateTo, andTerms);

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

  const errorEntries = Object.entries(platformErrors).filter(([, msg]) => msg);

  const handleExportCSV = useCallback(() => {
    setCsvExporting(true);
    exportToCSV(visible);
    setCsvExporting(false);
  }, [visible]);

  const handleExportPDF = useCallback(async () => {
    setPdfExporting(true);
    try {
      await exportToPDF(visible);
    } finally {
      setPdfExporting(false);
    }
  }, [visible]);

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

        <div className="export-btns">
          <button
            type="button"
            className="export-btn"
            disabled={visible.length === 0 || loading || csvExporting}
            onClick={handleExportCSV}
          >
            <CsvIcon />
            {csvExporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            className="export-btn"
            disabled={visible.length === 0 || loading || pdfExporting}
            onClick={handleExportPDF}
          >
            <PdfIcon />
            {pdfExporting ? "Exporting…" : "Export PDF"}
          </button>
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

      {hasSearched && visible.length > 0 && (
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
            {pending.length > 0
              ? `Fetching ${pending.map((p) => (p === "twitter" ? "X" : "LinkedIn")).join(" & ")}…`
              : `Sorted by ${sort === "likes" ? "engagement" : "date"}`}
          </span>
        </div>
      )}

      {!hasSearched ? (
        <div className="empty">
          Enter a keyword and hit <span className="kw">Search</span> to start scraping.
        </div>
      ) : visible.length > 0 ? (
        // Show results the moment any platform returns; a slow source still
        // loading appends a skeleton at the end instead of blocking the feed.
        <div className="feed">
          {visible.map((post) => (
            <PostCard
              key={post.url}
              post={post}
              keyword={keyword}
              maxLikes={maxLikes}
            />
          ))}
          {pending.length > 0 && <SkeletonCard />}
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
      ) : (
        <div className="empty">
          No posts found for <span className="kw">{keyword}</span>.
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
