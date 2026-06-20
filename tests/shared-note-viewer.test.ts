import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  NoteViewer,
  getActiveHeadingId,
  navigateGraphNode,
  routeWikiLinkClick,
  scrollToHeading,
  shouldInterceptWikiLinkClick,
  resolveHeadingTarget,
  savePersonOverride,
  scrollHeadingIntoView,
} from "../src/components/note-viewer";
import { createRevalidationRefreshController } from "../src/client/routes/wiki-route";
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

describe("shared note viewer behavioral helpers", () => {
  it("intercepts an ordinary self-targeted wiki click", () => {
    expect(
      shouldInterceptWikiLinkClick({
        href: "/wiki/history/Analytical%20Engine",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        event: {
          defaultPrevented: false,
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          preventDefault() {},
        },
      }),
    ).toBe(true);
  });

  it.each([
    ["already prevented", { defaultPrevented: true }],
    ["middle click", { button: 1 }],
    ["meta click", { metaKey: true }],
    ["ctrl click", { ctrlKey: true }],
    ["shift click", { shiftKey: true }],
    ["alt click", { altKey: true }],
  ])("bypasses callback interception for %s", (_, eventPatch) => {
    expect(
      shouldInterceptWikiLinkClick({
        href: "/wiki/history/Analytical%20Engine",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        event: {
          defaultPrevented: false,
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          preventDefault() {},
          ...eventPatch,
        },
      }),
    ).toBe(false);
  });

  it.each([
    ["download attribute", { download: "" }],
    ["non-self target", { target: "_blank" }],
    ["external origin", { href: "https://example.com/wiki/Elsewhere" }],
  ])("bypasses callback interception for %s", (_, optionPatch) => {
    expect(
      shouldInterceptWikiLinkClick({
        href: "/wiki/history/Analytical%20Engine",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        event: {
          defaultPrevented: false,
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          preventDefault() {},
        },
        ...optionPatch,
      }),
    ).toBe(false);
  });

  it("routes ordinary internal wiki clicks through the navigation callback with literal-percent slugs preserved", () => {
    const navigated: string[] = [];
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    expect(
      routeWikiLinkClick({
        href: "/wiki/Literal%2520Name",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        onNavigateNote: (slug) => navigated.push(slug),
        event,
      }),
    ).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(navigated).toEqual(["Literal%2520Name"]);
  });

  it("does not prevent default or navigate for bypassed clicks", () => {
    const navigated: string[] = [];
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    expect(
      routeWikiLinkClick({
        href: "/wiki/Literal%2520Name",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        onNavigateNote: (slug) => navigated.push(slug),
        event,
      }),
    ).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(navigated).toEqual([]);
  });

  it("delegates graph-node navigation through canonical wiki slugs", () => {
    const navigated: string[] = [];
    navigateGraphNode("people/Ada Lovelace", (slug) => navigated.push(slug));
    expect(navigated).toEqual(["people/Ada%20Lovelace"]);
  });

  it("resolves heading targets within a custom scroll root before falling back to the document", () => {
    const containerTarget = { id: "deep-dive", scrollIntoView() {} };
    const documentTarget = { id: "deep-dive", scrollIntoView() {} };
    const scrollRoot = {
      querySelector: vi.fn().mockReturnValue(containerTarget),
    };
    const doc = {
      getElementById: vi.fn().mockReturnValue(documentTarget),
    };

    expect(resolveHeadingTarget("deep-dive", scrollRoot, doc)).toBe(containerTarget);
    expect(scrollRoot.querySelector).toHaveBeenCalledWith("#deep-dive");
    expect(doc.getElementById).not.toHaveBeenCalled();
  });

  it("falls back to document heading lookup when no custom scroll target exists", () => {
    const documentTarget = { id: "deep-dive", scrollIntoView() {} };
    const scrollRoot = {
      querySelector: vi.fn().mockReturnValue(null),
    };
    const doc = {
      getElementById: vi.fn().mockReturnValue(documentTarget),
    };

    expect(resolveHeadingTarget("deep-dive", scrollRoot, doc)).toBe(documentTarget);
    expect(doc.getElementById).toHaveBeenCalledWith("deep-dive");
  });

  it("scrolls heading targets into view for viewport and custom scroll containers", () => {
    const viewportTarget = {
      scrollIntoView: vi.fn(),
    };
    const customTarget = {
      scrollIntoView: vi.fn(),
    };
    const scrollRoot = {
      scrollTo: vi.fn(),
    };

    scrollHeadingIntoView(viewportTarget, null);
    scrollHeadingIntoView(customTarget, scrollRoot);

    expect(viewportTarget.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(customTarget.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scrollRoot.scrollTo).not.toHaveBeenCalled();
  });

  it("resolves a heading by id and scrolls it into view", () => {
    const target = {
      scrollIntoView: vi.fn(),
    };
    const scrollRoot = {
      querySelector: vi.fn().mockReturnValue(target),
    };
    const doc = {
      getElementById: vi.fn(),
    };

    scrollToHeading("deep-dive", { current: scrollRoot } as unknown as RefObject<HTMLElement>, doc);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("computes the active heading relative to a custom root or the viewport", () => {
    const elements = [
      { id: "intro", getBoundingClientRect: () => ({ top: 40 }) },
      { id: "deep-dive", getBoundingClientRect: () => ({ top: 140 }) },
    ];
    const root = { getBoundingClientRect: () => ({ top: 60 }) };

    expect(getActiveHeadingId(elements, root)).toBe("deep-dive");
    expect(getActiveHeadingId(elements, null)).toBe("intro");
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

  it("does not resolve pending refreshes before loading starts and resolves them when revalidation returns idle", async () => {
    const controller = createRevalidationRefreshController();
    const revalidate = vi.fn();
    let resolved = false;

    const pending = controller.requestRefresh(revalidate).then(() => {
      resolved = true;
    });

    expect(revalidate).toHaveBeenCalledTimes(1);
    controller.onStateChange("idle");
    await Promise.resolve();
    expect(resolved).toBe(false);

    controller.onStateChange("loading");
    controller.onStateChange("idle");
    await pending;
    expect(resolved).toBe(true);
  });
});

describe("shared note viewer rendering and route boundaries", () => {
  it("renders article content, metadata, toc, related concepts, and graph markers without added category chips", () => {
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
          }),
        ),
      ),
    );

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("1 min read");
    expect(markup).toContain("25 words");
    expect(markup).toContain("Updated Jan 15, 2025");
    expect(markup).toContain("Intro paragraph about Ada.");
    expect(markup).toContain("Deep Dive");
    expect(markup).toContain("On this page");
    expect(markup).toContain("Related Concepts");
    expect(markup).toContain("Charles Babbage");
    expect(markup).toContain("Connections");
    expect(markup).not.toContain('aria-label="Categories"');
    expect(markup).not.toContain("hidden source note");
  });

  it("keeps route chrome in the wrapper and moved feature markers out of wiki-route", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/wiki-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toContain('from "@/components/note-viewer"');
    expect(routeSource).toContain("<header");
    expect(routeSource).toContain("Home");
    expect(routeSource).toContain("<NoteViewer");
    expect(routeSource).toContain("createRevalidationRefreshController");
    expect(routeSource).not.toContain("refreshing=");
    expect(routeSource).not.toContain("Related Concepts");
    expect(routeSource).not.toContain("NeighborhoodGraph");
    expect(routeSource).not.toContain("Mark as person");
    expect(routeSource).not.toContain("ReactMarkdown");
  });
});
