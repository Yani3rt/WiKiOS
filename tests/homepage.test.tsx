import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  HOME_SECTION_PREVIEW_LIMIT,
  HomepageContent,
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
import type { HomepageData, PageSummary, SearchResult } from "../src/lib/wiki-shared";

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
  });

  it("renders named browse landmarks and caps each initial list", () => {
    const pages = Array.from({ length: 6 }, (_, index) => page(index + 1));
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
            children: createElement(HomepageContent, { homepage }),
          },
        ),
      ),
    );

    expect(markup).toContain("<h2");
    expect(markup).toContain('aria-labelledby="home-featured-heading"');
    expect(markup).toContain('aria-controls="home-featured-list"');
    expect(markup).toContain("Show all 6");
    expect(markup).toContain("text-lg font-semibold");
    expect(markup).toContain("border-t-2 border-[var(--home-accent)]");
    expect(markup).toContain("home-note-link group");
    expect(markup).toContain(
      "pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-12 sm:pt-18",
    );
    expect(markup).not.toContain(">Note 5<");
    expect(markup).not.toContain("font-display");
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
