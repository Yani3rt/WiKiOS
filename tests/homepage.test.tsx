import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  HOME_SECTION_PREVIEW_LIMIT,
  HomepageContent,
  getBacklinkProgressPercentage,
  getHomeSummaryPreview,
  getVisibleHomePages,
} from "../src/components/homepage-content";
import { HomeFooter } from "../src/components/home-footer";
import {
  HOME_SEARCH_PREVIEW_LIMIT,
  getHomeSearchScrollBehavior,
  getRefreshStatusMessage,
  getVisibleSearchResults,
} from "../src/components/search-box";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";
import { selectFeaturedPages } from "../src/lib/wiki-queries";
import type {
  ExplorerPage,
  HomepageData,
  PageSummary,
  SearchResult,
} from "../src/lib/wiki-shared";

function page(index: number): PageSummary {
  return {
    file: `Note ${index}.md`,
    slug: `Note%20${index}`,
    title: `Note ${index}`,
    summary: `Summary for note ${index}`,
    backlinkCount: index,
    wordCount: 100 + index,
    modifiedAt: index,
  };
}

describe("Home progressive disclosure", () => {
  it("shows four items until a section or search result list is expanded", () => {
    const pages = Array.from({ length: 6 }, (_, index) => page(index + 1));
    const results: SearchResult[] = pages.map((item) => ({
      file: item.file,
      score: item.backlinkCount,
      matches: [],
    }));

    expect(HOME_SECTION_PREVIEW_LIMIT).toBe(4);
    expect(HOME_SEARCH_PREVIEW_LIMIT).toBe(4);
    expect(getVisibleHomePages(pages, false)).toHaveLength(4);
    expect(getVisibleHomePages(pages, true)).toHaveLength(6);
    expect(getVisibleSearchResults(results, false)).toHaveLength(4);
    expect(getVisibleSearchResults(results, true)).toHaveLength(6);
    expect(getBacklinkProgressPercentage(6, 6)).toBe(100);
    expect(getBacklinkProgressPercentage(5, 6)).toBeCloseTo(83.333, 3);
    expect(getBacklinkProgressPercentage(0, 0)).toBe(0);
    expect(getBacklinkProgressPercentage(10, 5)).toBe(100);
    expect(getHomeSummaryPreview("Short summary")).toBe("Short summary");
    expect(getHomeSummaryPreview("123456789012345678901234567890")).toBe(
      "123456789012345678901234567890",
    );
    expect(getHomeSummaryPreview("1234567890123456789012345678901")).toBe(
      "123456789012345678901234567890...",
    );
    expect(getHomeSummaryPreview("")).toBe("");
  });

  it("renders named browse landmarks and caps each initial list", () => {
    const pages = Array.from({ length: 6 }, (_, index) => page(index + 1));
    pages[0] = {
      ...pages[0],
      summary: "systemctl --user restart hermes-dashboard.service",
    };
    const recentlyVisitedPages: ExplorerPage[] = [
      {
        file: "Development/Git & Terminal/Terminal Reference.md",
        slug: "Development/Git & Terminal/Terminal Reference",
        title: "Terminal Reference",
        modifiedAt: 10,
      },
    ];
    const homepage: HomepageData = {
      totalPages: pages.length,
      totalWords: 1_000,
      featured: pages,
      recentPages: pages,
      categories: [],
      topConnected: pages,
      people: pages,
    };

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          WikiConfigProvider,
          {
            config: DEFAULT_WIKI_OS_CONFIG,
            children: createElement(HomepageContent, {
              homepage,
              recentlyVisitedPages,
            }),
          },
        ),
      ),
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain('aria-labelledby="home-featured-heading"');
    expect(markup).toContain('aria-controls="home-topConnected-list"');
    expect(markup).toContain("Show all 6");
    expect(markup).toContain("text-lg font-semibold");
    expect(markup).not.toContain(
      '<section aria-labelledby="home-recentPages-heading" class="border-t-2',
    );
    expect(markup).toContain('data-home-section-header="true"');
    expect(markup).not.toContain("border-b-2 border-[var(--home-accent)]");
    expect(markup.match(/data-home-section-header="true"/gu)?.length).toBe(4);
    expect(markup).toContain('data-home-section-icon-tile="true"');
    expect(markup.match(/data-home-section-icon-tile="true"/gu)?.length).toBe(4);
    expect(markup).toContain(
      "h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--home-accent-soft)]",
    );
    expect(markup).toContain(
      "mb-3 flex items-center justify-between gap-4 pb-4",
    );
    expect(
      markup.match(/h-5 w-5 shrink-0 text-\[var\(--home-accent\)\]/gu)?.length,
    ).toBe(4);
    expect(markup).toContain("home-note-link group");
    expect(markup).toContain(
      "pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-12 sm:pt-18",
    );
    expect(markup).toContain(
      "grid grid-cols-1 gap-y-10 lg:grid-cols-2 lg:gap-x-0",
    );
    expect(markup).toContain("space-y-10 lg:pr-6");
    expect(markup).toContain(
      "space-y-10 lg:border-l lg:border-[var(--home-border)] lg:pl-6",
    );
    expect(markup).not.toContain(">Note 5<");
    expect(markup).not.toContain("font-display");
    const recentlyUpdatedIndex = markup.indexOf(
      'aria-labelledby="home-recentPages-heading"',
    );
    const recentlyVisitedIndex = markup.indexOf(
      'aria-labelledby="home-featured-heading"',
    );
    const peopleIndex = markup.indexOf('aria-labelledby="home-people-heading"');
    const highlyConnectedIndex = markup.indexOf(
      'aria-labelledby="home-topConnected-heading"',
    );

    expect(recentlyUpdatedIndex).toBeGreaterThanOrEqual(0);
    expect(recentlyVisitedIndex).toBeGreaterThan(recentlyUpdatedIndex);
    expect(peopleIndex).toBeGreaterThan(recentlyVisitedIndex);
    expect(highlyConnectedIndex).toBeGreaterThan(peopleIndex);
    expect(markup).toContain("lucide-file-clock");
    expect(markup).toContain("lucide-eye");
    expect(markup).toContain("lucide-users");
    expect(markup).toContain("lucide-waypoints");
    expect(markup.match(/aria-hidden="true"/gu)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(markup).toContain('data-home-person-row="true"');
    expect(markup).toContain('data-home-person-backlink-pill="true"');
    expect(markup).toContain('data-home-person-chevron="true"');
    expect(markup.match(/data-home-person-row="true"/gu)?.length).toBe(4);
    expect(markup.match(/data-home-person-backlink-pill="true"/gu)?.length).toBe(4);
    expect(markup.match(/data-home-person-chevron="true"/gu)?.length).toBe(4);
    expect(markup).toContain(
      "min-w-0 flex-1 truncate text-[0.95rem] font-medium",
    );
    expect(markup).toContain('data-home-connected-row="true"');
    expect(markup).toContain('data-home-backlink-progress="true"');
    expect(markup).toContain("rounded-full bg-[var(--home-accent-soft)]");
    expect(markup).toContain(">1 link<");
    expect(markup).toContain(">4 links<");
    expect(markup).not.toContain(">1 backlink<");
    expect(markup).not.toContain(">4 backlinks<");
    expect(markup).toContain("lucide-chevron-right");
    expect(markup).toContain('data-home-summary-preview="true"');
    expect(markup.match(/data-home-summary-toggle="true"/gu)?.length).toBe(4);
    expect(markup).toContain('aria-label="Expand summary for Note 1"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-home-summary-content="true"');
    expect(markup).toContain(
      'title="systemctl --user restart hermes-dashboard.service"',
    );
    expect(markup).toContain("systemctl --user restart herme...");
    expect(markup).not.toContain(
      ">systemctl --user restart hermes-dashboard.service<",
    );
    const connectedListTag =
      markup.match(/<ul id="home-topConnected-list"[^>]*>/u)?.[0] ?? "";
    const peopleListTag =
      markup.match(/<ul id="home-people-list"[^>]*>/u)?.[0] ?? "";
    const recentListTag =
      markup.match(/<ul id="home-recentPages-list"[^>]*>/u)?.[0] ?? "";
    expect(connectedListTag).not.toContain("divide-y");
    expect(peopleListTag).not.toContain("divide-y");
    expect(recentListTag).toContain("divide-y");
    expect(markup).toContain("Recently visited");
    expect(markup).toContain("Notes you opened most recently on this device.");
    expect(markup).toContain("Terminal Reference");
    expect(markup).toContain("Development/Git &amp; Terminal/Terminal Reference");
    expect(markup).toContain(
      'href="/wiki/Development/Git%20%26%20Terminal/Terminal%20Reference"',
    );
    expect(markup).not.toContain("Worth revisiting");
    expect(markup).not.toContain("Connected notes worth another look.");
  });

  it("keeps Recently visited useful before a note has been opened", () => {
    const homepage: HomepageData = {
      totalPages: 0,
      totalWords: 0,
      featured: [],
      recentPages: [],
      categories: [],
      topConnected: [],
      people: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          WikiConfigProvider,
          {
            config: DEFAULT_WIKI_OS_CONFIG,
            children: createElement(HomepageContent, {
              homepage,
              recentlyVisitedPages: [],
            }),
          },
        ),
      ),
    );

    expect(markup).toContain("Recently visited");
    expect(markup).toContain("Open a note to start your recent history.");
    const recentlyUpdatedIndex = markup.indexOf(
      'aria-labelledby="home-recentPages-heading"',
    );
    const recentlyVisitedIndex = markup.indexOf(
      'aria-labelledby="home-featured-heading"',
    );
    const highlyConnectedIndex = markup.indexOf(
      'aria-labelledby="home-topConnected-heading"',
    );

    expect(markup).not.toContain('aria-labelledby="home-people-heading"');
    expect(markup).not.toContain("lucide-users");
    expect(recentlyUpdatedIndex).toBeGreaterThanOrEqual(0);
    expect(recentlyVisitedIndex).toBeGreaterThan(recentlyUpdatedIndex);
    expect(highlyConnectedIndex).toBeGreaterThan(recentlyVisitedIndex);
  });
});

describe("Home status and discovery helpers", () => {
  it("uses instant search scrolling when reduced motion is requested", () => {
    expect(getHomeSearchScrollBehavior(false)).toBe("smooth");
    expect(getHomeSearchScrollBehavior(true)).toBe("auto");
  });

  it("renders the Knowledge Dock as useful semantic navigation", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          WikiConfigProvider,
          {
            config: DEFAULT_WIKI_OS_CONFIG,
            children: createElement(HomeFooter, {
              totalPages: 30,
              refreshBusy: false,
              refreshStatus: "idle",
              refreshMessage: "",
              onRefresh: () => undefined,
              onFocusSearch: () => undefined,
            }),
          },
        ),
      ),
    );

    expect(markup).toContain("<footer");
    expect(markup).toContain("Your knowledge, ready for the next connection.");
    expect(markup).toContain('href="/explorer"');
    expect(markup).toContain('href="/graph"');
    expect(markup).toContain('href="/stats"');
    expect(markup).toContain('href="/setup?change=1"');
    expect(markup).toContain("30 notes indexed");
    expect(markup).toContain("Search your notes");
    expect(markup).toContain("Refresh index");
    expect(markup).toContain("⌘K");
    expect(markup).toContain("Local-first");
    expect(markup).toContain("Your notes stay on your device.");
    expect(markup).toContain("px-4 py-12 sm:px-6 sm:py-16");
    expect(markup).not.toContain("Your notes stay on this machine.");
  });

  it("announces useful refresh outcomes with note terminology", () => {
    expect(getRefreshStatusMessage("loading", 8)).toBe("Refreshing the note index…");
    expect(getRefreshStatusMessage("success", 1)).toBe(
      "Index refreshed. 1 note available.",
    );
    expect(getRefreshStatusMessage("success", 8)).toBe(
      "Index refreshed. 8 notes available.",
    );
    expect(getRefreshStatusMessage("error", 8)).toContain(
      "current notes are still available",
    );
  });

  it("keeps Home search controls explicit and free of the rejected visual treatments", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/components/search-box.tsx", import.meta.url)),
      "utf8",
    );
    const styles = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('aria-label="Clear search"');
    expect(source).toContain('aria-busy={refreshBusy}');
    expect(source).toContain("Refresh index");
    expect(source).toContain("Try search again");
    expect(source).not.toContain("bg-gradient");
    expect(source).not.toContain("font-display");
    expect(source).not.toContain('className="surface');
    expect(source).not.toContain("ArrowUp");
    expect(source).toContain('className="home-hero"');
    expect(source).toContain("<header>");
    expect(source).toContain("<HomeFooter");
    expect(source).toContain("onFocusSearch={handleFooterSearchFocus}");
    expect(source.match(/home-destination-icon/g)).toHaveLength(3);
    expect(styles).toContain("--home-hero: var(--brand-deep)");
    expect(styles).toContain(".home-footer {");
    expect(styles).toContain(".home-footer::before {");
    expect(styles).toContain("clip-path: ellipse(");
    expect(styles).toContain("background: var(--home-hero);");
    expect(styles).toContain(".home-destination-icon");
    expect(styles).toContain(".home-destination-link:hover .home-destination-icon");
    expect(styles).toContain(".home-note-link:hover");
    expect(styles).toContain("transition-duration: 220ms");
    expect(styles).toContain(".home-note-link {\n    transition: none;");
    expect(styles).not.toContain(".home-hero {\n  background-image:");
  });

  it("selects stable featured notes outside recent and connected lists when possible", () => {
    const pages = Array.from({ length: 12 }, (_, index) => page(index + 1));
    const recent = pages.slice(0, 4);
    const connected = pages.slice(4, 8);

    expect(selectFeaturedPages(pages, recent, connected).map((item) => item.file)).toEqual([
      "Note 12.md",
      "Note 11.md",
      "Note 10.md",
      "Note 9.md",
    ]);
    expect(selectFeaturedPages(pages, recent, connected)).toEqual(
      selectFeaturedPages(pages, recent, connected),
    );
  });
});
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
