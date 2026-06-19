import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  NoteViewer,
  savePersonOverride,
  wikiSlugFromHref,
} from "../src/components/note-viewer";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";
import type { WikiPageData } from "../src/lib/wiki-shared";

const samplePage: WikiPageData = {
  slug: "people/Ada%20Lovelace",
  title: "Ada Lovelace",
  fileName: "people/Ada Lovelace.md",
  contentMarkdown:
    "Intro paragraph about Ada.\n\n## Deep Dive\nAda links to [Analytical Engine](/wiki/history/Analytical%20Engine).\n\n## Related Concepts\n- [Charles Babbage](/wiki/Charles%20Babbage)\n\n## Source Notes\n- hidden source note",
  hasCodeBlocks: false,
  headings: [
    { text: "Deep Dive", id: "deep-dive", level: 2 },
    { text: "Source Notes", id: "source-notes", level: 2 },
  ],
  modifiedAt: Date.UTC(2025, 0, 15, 12),
  categories: ["history", "math"],
  neighbors: [
    { slug: "Charles%20Babbage", title: "Charles Babbage", backlinkCount: 9, categories: ["history"] },
  ],
  isPerson: false,
  personOverride: null,
};

describe("shared note viewer", () => {
  it("renders article content, metadata, categories, toc, related concepts, and graph markers", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, {
            page: samplePage,
            onNavigateNote: () => {},
            refreshing: true,
          }),
        ),
      ),
    );

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("1 min read");
    expect(markup).toContain("25 words");
    expect(markup).toContain("Updated Jan 15, 2025");
    expect(markup).toContain("history");
    expect(markup).toContain("math");
    expect(markup).toContain("Intro paragraph about Ada.");
    expect(markup).toContain("Deep Dive");
    expect(markup).toContain("On this page");
    expect(markup).toContain("Related Concepts");
    expect(markup).toContain("Charles Babbage");
    expect(markup).toContain("Connections");
    expect(markup).toContain("Saving...");
    expect(markup).not.toContain("Source Notes");
    expect(markup).not.toContain("hidden source note");
  });

  it("normalizes internal wiki hrefs for callback routing without corrupting literal percent data", () => {
    expect(wikiSlugFromHref("/wiki/history/Analytical%20Engine", "https://wiki.local")).toBe(
      "history/Analytical%20Engine",
    );
    expect(wikiSlugFromHref("/wiki/Literal%2520Name", "https://wiki.local")).toBe(
      "Literal%2520Name",
    );
    expect(wikiSlugFromHref("https://other.example/wiki/Ada", "https://wiki.local")).toBeNull();
    expect(wikiSlugFromHref("#deep-dive", "https://wiki.local")).toBeNull();
  });

  it("awaits refresh completion after saving a person override", async () => {
    const calls: string[] = [];
    let releaseRefresh: (() => void) | null = null;
    const refreshPromise = new Promise<void>((resolve) => {
      releaseRefresh = () => {
        calls.push("refresh-resolved");
        resolve();
      };
    });

    const savePromise = savePersonOverride({
      fileName: samplePage.fileName,
      override: "person",
      onRefreshPage: async () => {
        calls.push("refresh-started");
        await refreshPromise;
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => null,
      }),
    });

    let finished = false;
    void savePromise.then(() => {
      finished = true;
    });

    calls.push("after-save-call");
    await Promise.resolve();
    expect(calls).toContain("after-save-call");
    expect(finished).toBe(false);

    if (!releaseRefresh) {
      throw new Error("Expected refresh resolver to be set");
    }
    (releaseRefresh as () => void)();
    await savePromise;
    expect(finished).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(["after-save-call", "refresh-started", "refresh-resolved"]));
  });

  it("surfaces server errors from the person override request helper", async () => {
    await expect(
      savePersonOverride({
        fileName: samplePage.fileName,
        override: "not-person",
        fetchImpl: async () => ({
          ok: false,
          json: async () => ({ error: "Nope" }),
        }),
      }),
    ).rejects.toThrow("Nope");
  });
});

describe("wiki route shell", () => {
  it("keeps route chrome in the wrapper and delegates article features to NoteViewer", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/wiki-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toContain('from "@/components/note-viewer"');
    expect(routeSource).toContain("<header");
    expect(routeSource).toContain("Home");
    expect(routeSource).toContain("<NoteViewer");
    expect(routeSource).toContain('refreshing={revalidationState === "loading"}');
    expect(routeSource).not.toContain("Related Concepts");
    expect(routeSource).not.toContain("NeighborhoodGraph");
    expect(routeSource).not.toContain("Mark as person");
    expect(routeSource).not.toContain("ReactMarkdown");
    expect(routeSource).not.toContain("On this page");
  });
});
