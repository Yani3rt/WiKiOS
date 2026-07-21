import {
  BookOpenText,
  ChartNoAxesCombined,
  Command,
  FolderCog,
  Network,
  RefreshCw,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";

export type HomeFooterRefreshStatus = "idle" | "loading" | "success" | "error";

export interface HomeFooterProps {
  totalPages: number;
  refreshBusy: boolean;
  refreshStatus: HomeFooterRefreshStatus;
  refreshMessage: string;
  onRefresh: () => void;
  onFocusSearch: () => void;
}

export function HomeFooter({
  totalPages,
  refreshBusy,
  refreshStatus,
  refreshMessage,
  onRefresh,
  onFocusSearch,
}: HomeFooterProps) {
  const config = useWikiConfig();
  const noteLabel = totalPages === 1 ? "note" : "notes";
  const exploreLinks = [
    { to: "/explorer", label: "Browse notes", icon: BookOpenText },
    { to: "/graph", label: config.navigation.graphLabel, icon: Network },
    { to: "/stats", label: config.navigation.statsLabel, icon: ChartNoAxesCombined },
  ] as const;

  return (
    <footer className="home-footer mt-auto" aria-labelledby="home-footer-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 border-b border-[var(--home-hero-border)] pb-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-end">
          <div className="max-w-2xl">
            <h2
              id="home-footer-heading"
              className="text-2xl font-semibold tracking-[-0.025em] text-[var(--home-hero-ink)] sm:text-3xl"
            >
              Your knowledge, ready for the next connection.
            </h2>
            <p className="mt-3 max-w-[58ch] text-base leading-7 text-[var(--home-hero-muted)]">
              Return to search, follow a relationship, or keep your local index fresh.
            </p>
          </div>
          <button
            type="button"
            onClick={onFocusSearch}
            className="home-footer-primary"
          >
            <Search aria-hidden className="h-5 w-5" />
            Search your notes
          </button>
        </div>

        <div className="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-3">
          <nav aria-labelledby="home-footer-explore-heading">
            <h3 id="home-footer-explore-heading" className="home-footer-label">
              Explore
            </h3>
            <ul className="mt-3 space-y-1">
              {exploreLinks.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="home-footer-link">
                    <Icon aria-hidden className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="home-footer-vault-heading">
            <h3 id="home-footer-vault-heading" className="home-footer-label">
              Vault
            </h3>
            <p className="mt-4 text-sm tabular-nums text-[var(--home-hero-muted)]">
              {totalPages.toLocaleString()} {noteLabel} indexed
            </p>
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshBusy}
                aria-busy={refreshBusy}
                className="home-footer-link w-full disabled:cursor-wait disabled:opacity-70"
              >
                <RefreshCw
                  aria-hidden
                  className={`h-4 w-4 motion-reduce:animate-none ${refreshBusy ? "animate-spin" : ""}`}
                />
                {refreshStatus === "error" ? "Retry refresh" : "Refresh index"}
              </button>
              <Link to="/setup?change=1" className="home-footer-link">
                <FolderCog aria-hidden className="h-4 w-4" />
                Change vault
              </Link>
            </div>
            {refreshMessage ? (
              <p
                role={refreshStatus === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`mt-3 text-sm ${
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
          </section>

          <section aria-labelledby="home-footer-shortcut-heading">
            <h3 id="home-footer-shortcut-heading" className="home-footer-label">
              Quick search
            </h3>
            <div className="mt-4 flex items-start gap-3 text-sm leading-6 text-[var(--home-hero-muted)]">
              <Command
                aria-hidden
                className="mt-1 h-4 w-4 shrink-0 text-[var(--home-hero-accent)]"
              />
              <p>
                <kbd className="home-footer-kbd">⌘K</kbd> opens search from anywhere in WikiOS.
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--home-hero-border)] pt-6 text-sm text-[var(--home-hero-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-[var(--home-hero-ink)]">{config.siteTitle}</span>
          <span>Local-first. Your notes stay on your device.</span>
        </div>
      </div>
    </footer>
  );
}
