import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BookOpenText, ChartNoAxesCombined, Network, RefreshCw, Search, X } from "lucide-react";
import { Link, useRevalidator } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import {
  HomeFooter,
  type HomeFooterRefreshStatus,
} from "@/components/home-footer";
import { HighlightedText, buildHighlightQuery } from "@/components/highlighted-text";
import { ThemeSelector } from "@/components/theme-selector";
import { slugFromFileName, titleFromFileName, type PageSummary, type SearchResult } from "@/lib/wiki-shared";

export const HOME_SEARCH_PREVIEW_LIMIT = 4;

type RefreshStatus = HomeFooterRefreshStatus;

function SearchInput({
  query,
  isSearching,
  onChange,
  onClear,
  inputRef,
}: {
  query: string;
  isSearching: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const config = useWikiConfig();

  return (
    <form
      role="search"
      onSubmit={(event) => event.preventDefault()}
      className="relative w-full"
    >
      <label htmlFor="home-note-search" className="sr-only">
        Search notes
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--home-muted)]"
      />
      <input
        id="home-note-search"
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={config.searchPlaceholder}
        aria-controls="home-search-results"
        aria-busy={isSearching}
        autoComplete="off"
        className="min-h-12 w-full rounded-lg border border-[var(--home-control-border)] bg-[var(--home-surface)] py-3 pl-11 pr-12 text-base text-[var(--home-ink)] outline-none placeholder:text-[var(--home-muted)] hover:border-[var(--home-muted)] focus:border-[var(--home-accent)] focus:ring-2 focus:ring-[var(--home-focus-soft)]"
      />
      {query ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-[var(--home-muted)] hover:bg-[var(--home-accent-soft)] hover:text-[var(--home-ink)]"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </form>
  );
}

export interface TopicBrowseState {
  name: string;
  emoji: string;
  pages: PageSummary[];
}

export function getVisibleSearchResults(
  results: readonly SearchResult[],
  expanded: boolean,
) {
  return expanded ? results : results.slice(0, HOME_SEARCH_PREVIEW_LIMIT);
}

export function getRefreshStatusMessage(status: RefreshStatus, totalPages: number) {
  if (status === "loading") return "Refreshing the note index…";
  if (status === "success") {
    return `Index refreshed. ${totalPages.toLocaleString()} ${totalPages === 1 ? "note" : "notes"} available.`;
  }
  if (status === "error") {
    return "The note index could not be refreshed. Your current notes are still available.";
  }
  return "";
}

export function getHomeSearchScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function SearchBox({
  totalPages,
  children,
}: {
  totalPages: number;
  children: ReactNode;
}) {
  const config = useWikiConfig();
  const { revalidate, state: revalidationState } = useRevalidator();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [showAllResults, setShowAllResults] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const highlight = useMemo(() => buildHighlightQuery(deferredQuery), [deferredQuery]);

  useEffect(() => {
    const trimmedQuery = deferredQuery.trim();

    if (!trimmedQuery) {
      abortRef.current?.abort();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { error?: string; results?: SearchResult[] };

        if (!response.ok) throw new Error(data.error ?? "Search failed");

        if (!controller.signal.aborted) {
          startTransition(() => {
            setResults(data.results ?? []);
            setIsSearching(false);
            setSearchError(null);
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        if (!controller.signal.aborted) {
          setIsSearching(false);
          setSearchError("We couldn’t search your notes. Check the connection and try again.");
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deferredQuery, searchAttempt]);

  const resetSearch = () => {
    setQuery("");
    setResults(null);
    setIsSearching(false);
    setSearchError(null);
    setShowAllResults(false);
    abortRef.current?.abort();
    inputRef.current?.focus();
  };

  const handleQueryChange = (value: string) => {
    const trimmedValue = value.trim();
    setQuery(value);
    setIsSearching(trimmedValue.length > 0);
    setSearchError(null);
    setShowAllResults(false);
    if (!trimmedValue) setResults(null);
  };

  const retrySearch = () => {
    if (!query.trim()) return;
    setSearchError(null);
    setIsSearching(true);
    setSearchAttempt((attempt) => attempt + 1);
  };

  const refreshBusy = refreshStatus === "loading" || revalidationState === "loading";
  const handleRefresh = async () => {
    if (refreshBusy) return;
    setRefreshStatus("loading");

    try {
      const response = await fetch("/api/admin/reindex", { method: "POST" });
      if (!response.ok) throw new Error("Reindex failed");
      await revalidate();
      setRefreshStatus("success");
    } catch {
      setRefreshStatus("error");
    }
  };

  const handleFooterSearchFocus = () => {
    const input = inputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({
      behavior: getHomeSearchScrollBehavior(reducedMotion),
      block: "center",
    });
  };

  const hasQuery = query.trim().length > 0;
  const visibleResults = getVisibleSearchResults(results ?? [], showAllResults);
  const refreshMessage = getRefreshStatusMessage(refreshStatus, totalPages);

  return (
    <div className="home-shell flex min-h-screen flex-col">
      <div className="home-hero">
        <header>
          <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              to="/"
              aria-label={`${config.siteTitle} home`}
              className="inline-flex min-h-11 max-w-[60%] min-w-0 items-center truncate rounded-md py-2 text-base font-semibold tracking-[-0.01em] text-[var(--home-hero-ink)]"
              onClick={(event) => {
                if (!hasQuery) return;
                event.preventDefault();
                resetSearch();
              }}
            >
              {config.siteTitle}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-[var(--home-hero-muted)]">
                {totalPages.toLocaleString()} {totalPages === 1 ? "note" : "notes"} indexed
              </span>
              <ThemeSelector />
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
          {!hasQuery ? (
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[var(--home-hero-ink)] sm:text-4xl">
                Find a note
              </h1>
              <p className="mt-3 max-w-[62ch] text-base leading-7 text-[var(--home-hero-muted)]">
                {config.tagline}
              </p>
            </div>
          ) : null}

          <div className={`w-full max-w-2xl ${hasQuery ? "" : "mt-7"}`}>
            <SearchInput
              query={query}
              isSearching={isSearching}
              onChange={handleQueryChange}
              onClear={resetSearch}
              inputRef={inputRef}
            />

            <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-[var(--home-hero-muted)]">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshBusy}
                aria-busy={refreshBusy}
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-medium text-[var(--home-hero-accent)] hover:bg-[var(--home-hero-hover)] disabled:cursor-wait disabled:opacity-70"
              >
                <RefreshCw
                  aria-hidden
                  className={`h-4 w-4 motion-reduce:animate-none ${refreshBusy ? "animate-spin" : ""}`}
                />
                {refreshStatus === "error" ? "Retry refresh" : "Refresh index"}
              </button>
              <span className="hidden items-center gap-2 sm:flex">
                <kbd className="rounded border border-[var(--home-hero-control-border)] bg-[var(--home-hero-chip)] px-1.5 py-0.5 font-sans text-xs font-medium text-[var(--home-hero-ink)]">
                  ⌘K
                </kbd>
                Quick search
              </span>
            </div>

            {refreshMessage ? (
              <p
                role={refreshStatus === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`mb-2 text-sm ${
                  refreshStatus === "error"
                    ? "text-[var(--home-hero-error)]"
                    : refreshStatus === "success"
                      ? "text-[var(--home-hero-success)]"
                      : "text-[var(--home-hero-muted)]"
                }`}
              >
                {refreshMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-8 sm:px-6">
        {hasQuery ? (
          <div className="w-full max-w-2xl pt-8 sm:pt-10">
            <section
              id="home-search-results"
              aria-label="Search results"
              className="overflow-hidden rounded-lg border border-[var(--home-border)] bg-[var(--home-surface)]"
            >
              {isSearching ? (
                <div role="status" aria-live="polite" className="divide-y divide-[var(--home-border)]">
                  <span className="sr-only">Searching notes…</span>
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="space-y-2 px-4 py-4">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--home-skeleton)] motion-reduce:animate-none" />
                      <div className="h-3 w-full animate-pulse rounded bg-[var(--home-skeleton)] motion-reduce:animate-none" />
                    </div>
                  ))}
                </div>
              ) : searchError ? (
                <div role="alert" className="p-5">
                  <p className="text-sm text-[var(--home-error)]">{searchError}</p>
                  <button
                    type="button"
                    onClick={retrySearch}
                    className="mt-3 min-h-11 rounded-md border border-[var(--home-control-border)] px-3 text-sm font-medium text-[var(--home-ink)] hover:bg-[var(--home-accent-soft)]"
                  >
                    Try search again
                  </button>
                </div>
              ) : results && results.length === 0 ? (
                <div className="p-5">
                  <p className="text-sm font-medium text-[var(--home-ink)]">No notes match “{query}”.</p>
                  <p className="mt-1 text-sm text-[var(--home-muted)]">
                    Try fewer words or search for a note title.
                  </p>
                  <button
                    type="button"
                    onClick={resetSearch}
                    className="mt-3 min-h-11 rounded-md border border-[var(--home-control-border)] px-3 text-sm font-medium text-[var(--home-ink)] hover:bg-[var(--home-accent-soft)]"
                  >
                    Clear search
                  </button>
                </div>
              ) : results ? (
                <>
                  <div className="border-b border-[var(--home-border)] px-4 py-3 text-sm text-[var(--home-muted)]">
                    {results.length.toLocaleString()} {results.length === 1 ? "result" : "results"}
                  </div>
                  <ul className="divide-y divide-[var(--home-border)]">
                    {visibleResults.map((result) => {
                      const title = titleFromFileName(result.file);
                      const slug = slugFromFileName(result.file);
                      return (
                        <li key={result.file}>
                          <Link
                            to={`/wiki/${slug}`}
                            className="group block min-h-14 px-4 py-3 hover:bg-[var(--home-accent-soft)]"
                          >
                            <span className="block truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
                              {title}
                            </span>
                            {result.matches.length > 0 ? (
                              <span className="mt-1 line-clamp-2 block text-sm leading-5 text-[var(--home-muted)]">
                                <HighlightedText
                                  highlight={highlight}
                                  text={result.matches[0].snippet}
                                />
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {results.length > HOME_SEARCH_PREVIEW_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => setShowAllResults((expanded) => !expanded)}
                      aria-expanded={showAllResults}
                      className="min-h-12 w-full border-t border-[var(--home-border)] px-4 text-left text-sm font-medium text-[var(--home-accent)] hover:bg-[var(--home-accent-soft)]"
                    >
                      {showAllResults ? "Show fewer results" : `Show all ${results.length} results`}
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>
          </div>
        ) : null}

        {!hasQuery ? (
          <>
            <nav aria-label="Explore your knowledge" className="-mt-6 grid max-w-4xl gap-2 sm:grid-cols-3">
              <Link to="/explorer" className="home-destination-link">
                <span className="home-destination-icon">
                  <BookOpenText aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--home-ink)]">Browse notes</span>
                  <span className="block text-sm text-[var(--home-muted)]">Open the note explorer</span>
                </span>
              </Link>
              <Link to="/graph" className="home-destination-link">
                <span className="home-destination-icon">
                  <Network aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--home-ink)]">{config.navigation.graphLabel}</span>
                  <span className="block text-sm text-[var(--home-muted)]">See how notes connect</span>
                </span>
              </Link>
              <Link to="/stats" className="home-destination-link">
                <span className="home-destination-icon">
                  <ChartNoAxesCombined aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--home-ink)]">{config.navigation.statsLabel}</span>
                  <span className="block text-sm text-[var(--home-muted)]">Review the vault index</span>
                </span>
              </Link>
            </nav>
            {children}
          </>
        ) : null}
      </main>
      <HomeFooter
        totalPages={totalPages}
        refreshBusy={refreshBusy}
        refreshStatus={refreshStatus}
        refreshMessage={refreshMessage}
        onRefresh={handleRefresh}
        onFocusSearch={handleFooterSearchFocus}
      />
    </div>
  );
}
