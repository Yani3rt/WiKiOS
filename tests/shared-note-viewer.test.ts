import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  NoteViewer,
  copyCodeBlockText,
  getActiveHeadingId,
  navigateGraphNode,
  renderedCodeBlockText,
  routeWikiLinkClick,
  scrollToHeading,
  shouldInterceptWikiLinkClick,
  resolveHeadingTarget,
  savePersonOverride,
  scrollHeadingIntoView,
} from "../src/components/note-viewer";
import { applyExplorerRefreshResult } from "../src/client/routes/explorer-route";
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
    expect(markup).toMatch(/<h2[^>]*id="deep-dive"/u);
    expect(markup).toContain("On this page");
    expect(markup).toContain("Related Concepts");
    expect(markup).toContain("Charles Babbage");
    expect(markup).toContain("Connections");
    expect(markup).toContain('aria-label="Connected notes"');
    expect(markup).toContain('aria-label="Open connected note Charles Babbage"');
    expect(markup).not.toContain('aria-label="Categories"');
    expect(markup).not.toContain("hidden source note");
  });

  it("places mobile connections after the article behind a collapsed disclosure", () => {
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
    const articleEnd = markup.indexOf("</article>");
    const mobileConnections = markup.indexOf('data-note-viewer-mobile-connections="true"');

    expect(articleEnd).toBeGreaterThan(-1);
    expect(mobileConnections).toBeGreaterThan(articleEnd);
    expect(markup).toContain("<summary");
    expect(markup).toContain("1 connection");
    expect(markup).not.toContain('data-note-viewer-inline-graph="true"');
  });

  it("labels tagged code blocks and leaves untagged blocks unlabeled", () => {
    const codePage: WikiPageData = {
      ...samplePage,
      contentMarkdown: "```bash\ngit status\n```\n\n```\ngit branch -d\n```",
      hasCodeBlocks: true,
      headings: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page: codePage, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup.match(/data-code-language=/gu)).toHaveLength(1);
    expect(markup).toContain('data-code-language="bash"');
    expect(markup).toContain(">BASH</span>");
  });

  it("renders a copy button for fenced code blocks", () => {
    const codePage: WikiPageData = {
      ...samplePage,
      contentMarkdown: "```bash\ngit status\n```",
      hasCodeBlocks: true,
      headings: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page: codePage, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toMatch(/>Copy<\/button>/u);
  });

  it("renders mermaid fenced blocks as diagram containers", () => {
    const mermaidPage: WikiPageData = {
      ...samplePage,
      contentMarkdown: ["```mermaid", "graph TD", "  A[Ideas] --> B[Execution]", "```"].join(
        "\n",
      ),
      hasCodeBlocks: true,
      headings: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page: mermaidPage, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup).toContain('class="note-mermaid-block"');
    expect(markup).toContain('data-mermaid-source="graph TD\n  A[Ideas] --&gt; B[Execution]"');
    expect(markup).toContain('class="note-mermaid-fallback"');
    expect(markup).not.toContain('aria-label="Copy code"');
    expect(markup).not.toContain('data-code-language="mermaid"');
  });

  it("keeps the code-block wrapper hook-free across ordinary and mermaid navigation", () => {
    const viewerSource = readFileSync(
      fileURLToPath(new URL("../src/components/note-viewer.tsx", import.meta.url)),
      "utf8",
    );
    const wrapperStart = viewerSource.indexOf("function CodeBlockPre(");
    const wrapperEnd = viewerSource.indexOf("function parseMarkdownLinks", wrapperStart);
    const wrapperSource = viewerSource.slice(wrapperStart, wrapperEnd);

    expect(wrapperStart).toBeGreaterThan(-1);
    expect(wrapperEnd).toBeGreaterThan(wrapperStart);
    expect(wrapperSource).toContain("<CopyableCodeBlock");
    expect(wrapperSource).not.toMatch(/use(?:State|Effect|Callback)\(/u);
  });

  it("wraps GFM tables for horizontal scrolling while preserving semantic markup", () => {
    const tablePage: WikiPageData = {
      ...samplePage,
      contentMarkdown: ["| Name | Role |", "| :--- | ---: |", "| Ada | Mathematician |"].join(
        "\n",
      ),
      headings: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page: tablePage, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup).toContain('class="note-table-scroll"');
    expect(markup).toMatch(/<div class="note-table-scroll"><table>/u);
    expect(markup).toContain("<thead>");
    expect(markup).toContain("<tbody>");
    expect(markup).toContain('<th style="text-align:left">Name</th>');
    expect(markup).toContain('<th style="text-align:right">Role</th>');
    expect(markup).toContain('<td style="text-align:left">Ada</td>');
  });

  it("renders tree-style note paragraphs as preserved-whitespace diagram blocks", () => {
    const treePage: WikiPageData = {
      ...samplePage,
      contentMarkdown: [
        "Vault/",
        "├── Daily/                 # YYYY-MM-DD.md daily notes — append-only",
        "├── System/",
        "│   └── Assistant/",
        "│       ├── context.md     # Operations, health, family overview",
        "│       └── preferences.md # Communication style, delivery rules",
      ].join("\n"),
      headings: [],
    };
    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page: treePage, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup).toContain('class="note-ascii-block"');
    expect(markup).toMatch(/<pre class="note-ascii-block"><code>Vault\//u);
    expect(markup).toContain("├── Daily/");
    expect(markup).toContain("preferences.md");
    expect(markup).not.toContain("<p>Vault/");
  });

  it("extracts the raw text from a rendered code block child", () => {
    const codeText = renderedCodeBlockText(
      createElement(
        "code",
        { className: "hljs language-bash" },
        createElement("span", { className: "hljs-built_in" }, "git"),
        " status\n",
        createElement("span", { className: "hljs-string" }, "--short"),
      ),
    );

    expect(codeText).toBe("git status\n--short");
  });

  it("forwards raw code text to the clipboard writer", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyCodeBlockText("git status", writeText);

    expect(writeText).toHaveBeenCalledWith("git status");
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
    expect(routeSource).toContain("max-w-6xl");
    expect(routeSource).toContain("createRevalidationRefreshController");
    expect(routeSource).not.toContain("refreshing=");
    expect(routeSource).not.toContain("Related Concepts");
    expect(routeSource).not.toContain("NeighborhoodGraph");
    expect(routeSource).not.toContain("Mark as person");
    expect(routeSource).not.toContain("ReactMarkdown");
  });

  it("gives unhighlighted fenced code a readable foreground on the dark code surface", () => {
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(globalsSource).toMatch(
      /\.prose-wiki pre code\s*\{[^}]*color:\s*#c9d1d9;/u,
    );
  });

  it("keeps highlighted code blocks on the same surface color as their parent pre", () => {
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(globalsSource).toMatch(
      /\.prose-wiki pre code\s*\{[^}]*background:\s*transparent;/u,
    );
  });

  it("styles note tables for readable horizontal overflow", () => {
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-table-scroll\s*\{[^}]*overflow-x:\s*auto;/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-table-scroll table\s*\{[^}]*min-width:\s*36rem;/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-table-scroll th\s*\{[^}]*font-weight:\s*600;/u,
    );
    expect(globalsSource).toContain(".prose-wiki .note-table-scroll tbody tr:nth-child(even)");
  });

  it("styles mermaid blocks as light note diagrams", () => {
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-mermaid-block\s*\{[^}]*background:\s*var\(--brand-surface\);/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-mermaid-render\s*\{[^}]*min-height:\s*12rem;/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-mermaid-fallback\s*\{[^}]*white-space:\s*pre;/u,
    );
  });

  it("styles ascii diagram blocks for light-theme whitespace preservation", () => {
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-ascii-block\s*\{[^}]*white-space:\s*pre;/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-ascii-block\s*\{[^}]*font-family:\s*var\(--font-mono\);/u,
    );
    expect(globalsSource).toMatch(
      /\.prose-wiki \.note-ascii-block\s*\{[^}]*background:\s*var\(--brand-surface\);/u,
    );
  });

  it("reuses the shared NoteViewer inside explorer ready tabs without local markdown rendering", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );
    const viewerSource = readFileSync(
      fileURLToPath(new URL("../src/components/note-viewer.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toContain('from "@/components/note-viewer"');
    expect(routeSource).toContain("<NoteViewer");
    expect(routeSource).toContain("page={page}");
    expect(routeSource).toContain("onNavigateNote={onWikiLink}");
    expect(routeSource).toContain("onRefreshPage={refreshActivePage}");
    expect(routeSource).toContain("scrollContainerRef={workspaceScrollRef}");
    expect(routeSource).toContain("explorer-note-viewer-shell");
    expect(routeSource).not.toContain("ReactMarkdown");
    expect(routeSource).not.toContain("type Components");
    expect(routeSource).not.toContain("markdownBaseComponents");
    expect(routeSource).not.toContain("const markdownComponents = useMemo<Components>");
    expect(viewerSource).toContain('data-note-viewer-mobile-toc="true"');
    expect(viewerSource).toContain('data-note-viewer-side-rail="true"');
    expect(viewerSource).toContain('data-note-viewer-mobile-connections="true"');
    expect(viewerSource).toContain("xl:grid");
    expect(viewerSource).toContain("xl:max-w-[calc(48rem+13rem+2rem)]");
    expect(viewerSource).toContain("xl:grid-cols-[minmax(0,1fr)_13rem]");
    expect(viewerSource).toContain("xl:static");
    expect(globalsSource).toContain("@container explorer-note-viewer");
    expect(globalsSource).toContain("(max-width: 35.99rem)");
    expect(globalsSource).toContain("(min-width: 36rem)");
    expect(globalsSource).toContain(".note-viewer-side-rail > div");
    expect(globalsSource).toContain("position: sticky;");
    expect(globalsSource).toContain("align-self: stretch;");
    expect(globalsSource).toContain(".explorer-note-viewer-shell");
    expect(globalsSource).toContain(".note-viewer-mobile-toc");
    expect(globalsSource).toContain(".note-viewer-side-rail");
    expect(globalsSource).toContain(".note-viewer-mobile-connections");
  });

  it("bounds the explorer to the viewport so its tab panel is the note scroll root", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toContain("md:h-dvh");
    expect(routeSource).toContain("md:min-h-0");
    expect(routeSource).toContain("md:overflow-hidden");
    expect(routeSource).toContain("overflow-y-auto");
  });

  it("only applies refreshed explorer pages while the same slug is still active", () => {
    expect(
      applyExplorerRefreshResult("people/Ada%20Lovelace", "people/Ada%20Lovelace", samplePage),
    ).toEqual({
      slug: "people/Ada%20Lovelace",
      status: "ready",
      page: samplePage,
    });
    expect(
      applyExplorerRefreshResult("history/Analytical%20Engine", "people/Ada%20Lovelace", samplePage),
    ).toBeNull();
  });

  it("keeps refresh failures local to NoteViewer instead of replacing the ready reader state", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toMatch(
      /const refreshActivePage = useCallback\(async \(\) => \{[\s\S]*?catch \(error\) \{[\s\S]*?throw error;[\s\S]*?\}\s*,?\s*\}, \[navigate\]\);/u,
    );
    expect(routeSource).not.toContain('setReaderState({ slug, status: "error" })');
  });
});
