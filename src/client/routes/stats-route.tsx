import { House } from "lucide-react";
import { useLoaderData, Link, redirect } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import type { WikiStats } from "@/lib/wiki-shared";
import { ChangeVaultLink } from "@/components/change-vault-link";

import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

export async function loader() {
  try {
    return await fetchJson<WikiStats>("/api/stats");
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const stats = useLoaderData() as WikiStats;
  const config = useWikiConfig();

  const statCards = [
    {
      label: "Pages",
      value: stats.total_pages.toLocaleString(),
      accent: "var(--teal)",
    },
    {
      label: "Words",
      value: stats.total_words.toLocaleString(),
      accent: "var(--brand-deep-teal-hover)",
    },
    {
      label: "Avg. Words",
      value: (stats.total_pages > 0
        ? Math.round(stats.total_words / stats.total_pages)
        : 0
      ).toLocaleString(),
      accent: "var(--brand-warning)",
    },
    {
      label: "Top Links",
      value: (stats.top_backlinks[0]?.count ?? 0).toLocaleString(),
      accent: "var(--teal)",
    },
  ];

  const barAccents = [
    "var(--brand-accent)",
    "var(--brand-deep-teal-hover)",
    "var(--brand-warning)",
  ];

  return (
    <div className="app-route-shell flex min-h-screen flex-col">
      <header className="app-route-header flex h-16 items-center justify-between px-4 md:px-5">
        <Link
          to="/"
          aria-label="Back to wiki home"
          className="app-route-header-brand rounded-md px-1 py-1 text-left"
        >
          <p className="app-route-header-meta text-xs font-medium">
            {config.siteTitle}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <House className="app-route-header-meta h-4 w-4" />
            <h1 className="text-base font-semibold">
              Wiki {config.navigation.statsLabel}
            </h1>
          </div>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="app-route-header-control stats-route-control flex items-center gap-1.5 px-3 py-2 text-xs sm:gap-2 sm:px-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-on-deep-accent)]" />
            <span className="font-semibold tabular-nums">
              {stats.total_pages.toLocaleString()}
            </span>
            <span className="hidden sm:inline">articles</span>
          </span>
          <ChangeVaultLink className="stats-route-control" />
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
      >
        <div className="space-y-10 sm:space-y-12">
          <div>
            <span className="chip-teal inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" />
              {config.homepage.labels.statsEyebrow}
            </span>
            <h1 className="mt-3 font-display text-[2.75rem] leading-[1.05] tracking-[-0.02em] text-[var(--foreground)] sm:text-5xl">
              {config.navigation.statsLabel}
            </h1>
            <p className="mt-2 text-[0.9rem] text-[var(--muted-foreground)] sm:text-[0.95rem]">
              {config.homepage.labels.statsDescription}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="surface-raised rounded-xl p-4 sm:p-5"
                style={{ borderTopColor: card.accent }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: card.accent }}
                    />
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      {card.label}
                    </p>
                  </div>
                  <p className="mt-2 font-display text-[1.75rem] leading-tight text-[var(--foreground)] sm:mt-3 sm:text-4xl">
                    {card.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--brand-accent)]" />
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Most Backlinked Concepts
              </p>
            </div>
            <div className="surface-raised overflow-hidden rounded-xl">
              {stats.top_backlinks.map((item, index) => {
                const accent = barAccents[index % barAccents.length];
                const widthPct = Math.max(
                  10,
                  (item.count / (stats.top_backlinks[0]?.count ?? 1)) * 100,
                );
                return (
                  <div
                    key={item.page}
                    className={`relative flex items-center justify-between gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 ${
                      index > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--brand-deep-teal)] text-[0.65rem] font-semibold text-[var(--brand-on-deep)]"
                      >
                        {index + 1}
                      </span>
                      <span className="truncate font-display text-[0.95rem] text-[var(--foreground)] sm:text-[1rem]">
                        {item.page}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      <div className="relative hidden h-1.5 w-20 overflow-hidden rounded-full bg-[var(--secondary)] sm:block sm:w-32">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${widthPct}%`, background: accent }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono text-xs font-semibold text-[var(--foreground)] sm:w-10">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="pb-10" />
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
