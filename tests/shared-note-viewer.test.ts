
import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WikiConfigProvider } from "../src/client/wiki-config";
import {
  fetchJson,
  fetchWikiPage,
  isSetupRequiredResponse,
} from "../src/client/api";
import {
  NoteViewer,
  copyCodeBlockText,
  getActiveHeadingId,
  isExternalHref,
  isInternalAppHref,
  navigateGraphNode,
  renderedCodeBlockText,
  routeWikiLinkClick,
  scrollToHeading,
  shouldInterceptWikiLinkClick,
  resolveHeadingTarget,
  savePersonOverride,
  scrollHeadingIntoView,
} from "../src/components/note-viewer";
import { WikilinkAmbiguityView } from "../src/components/wikilink-ambiguity-view";
import { applyExplorerRefreshResult } from "../src/client/routes/explorer-route";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";
import type { WikiLinkAmbiguityData, WikiPageData } from "../src/lib/wiki-shared";

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

const ambiguousWikiLink: WikiLinkAmbiguityData = {
  code: "AMBIGUOUS_WIKILINK",
  target: "Note",
  candidates: [
    { file: "Archive/Note.md", slug: "Archive/Note", title: "Note" },
    { file: "Projects/Note.md", slug: "Projects/Note", title: "Note" },
  ],
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

  it("does not intercept external links after adding the indicator", () => {
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {},
    };

    expect(
      shouldInterceptWikiLinkClick({
        href: "https://example.com/docs",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        event,
      }),
    ).toBe(false);
  });

  it("continues to intercept internal wiki links after adding the indicator", () => {
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {},
    };

    expect(
      shouldInterceptWikiLinkClick({
        href: "/wiki/history/Analytical%20Engine",
        origin: "https://wiki.local",
        target: undefined,
        download: undefined,
        event,
      }),
    ).toBe(true);
  });

  it("delegates graph-node navigation through canonical wiki slugs", () => {
    const navigated: string[] = [];
    navigateGraphNode("people/Ada Lovelace", (slug) => navigated.push(slug));
    expect(navigated).toEqual(["people/Ada%20Lovelace"]);
  });

  it("treats wiki and app routes as internal hrefs", () => {
    expect(isInternalAppHref("/wiki/history/Analytical%20Engine", "https://wiki.local")).toBe(true);
    expect(isInternalAppHref("/explorer/history/Analytical%20Engine", "https://wiki.local")).toBe(true);
    expect(isInternalAppHref("/graph", "https://wiki.local")).toBe(true);
    expect(isInternalAppHref("/stats", "https://wiki.local")).toBe(true);
    expect(isInternalAppHref("#deep-dive", "https://wiki.local")).toBe(true);
    expect(isExternalHref("https://example.com/docs", "https://wiki.local")).toBe(true);
    expect(isExternalHref("http://example.com/docs", "https://wiki.local")).toBe(true);
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


});

describe("shared note viewer rendering and route boundaries", () => {
  it("keeps fetchJson compatibility by rejecting HTTP 300", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(ambiguousWikiLink), {
          status: 300,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    try {
      const error = await fetchJson("/api/wiki/Note").catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(300);
      expect(isSetupRequiredResponse(error)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps fetchJson compatibility by exposing HTTP 409 as setup-required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Setup required" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    try {
      const error = await fetchJson("/api/home").catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(409);
      expect(isSetupRequiredResponse(error)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("parses an HTTP 300 WikiLink ambiguity as a normal page-load result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ambiguousWikiLink), {
        status: 300,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await expect(fetchWikiPage("/api/wiki/Note")).resolves.toEqual({
        status: "ambiguous",
        ambiguity: ambiguousWikiLink,
      });
      expect(fetchImpl).toHaveBeenCalledWith("/api/wiki/Note", {
        headers: { accept: "application/json" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("wiki route: accessible ambiguity chooser", () => {
    const markup = renderToStaticMarkup(
      createElement(WikilinkAmbiguityView, {
        target: ambiguousWikiLink.target,
        candidates: ambiguousWikiLink.candidates,
        onSelect: () => {},
        onBrowseNotes: () => {},
      }),
    );

    expect(markup).toContain("Which note did you mean?");
    expect(markup).toContain("Archive/Note.md");
    expect(markup).toContain("Projects/Note.md");
    expect(markup).toContain("Browse notes");
    expect(markup.match(/<button\b/gu)).toHaveLength(3);
  });

  it("forwards candidate and browse button clicks to chooser callbacks without a DOM", () => {
    const selected: string[] = [];
    let browsed = false;
    const chooser = WikilinkAmbiguityView({
      target: ambiguousWikiLink.target,
      candidates: ambiguousWikiLink.candidates,
      onSelect: (candidate) => selected.push(candidate.slug),
      onBrowseNotes: () => {
        browsed = true;
      },
    });
    const buttons: ReactElement<{ onClick?: () => void }>[] = [];
    const collectButtons = (node: ReactNode) => {
      if (Array.isArray(node)) {
        node.forEach(collectButtons);
        return;
      }
      if (!isValidElement(node)) return;
      if (node.type === "button") {
        buttons.push(node as ReactElement<{ onClick?: () => void }>);
      }
      collectButtons((node.props as { children?: ReactNode }).children);
    };

    collectButtons(chooser);
    buttons.forEach((button) => button.props.onClick?.());

    expect(selected).toEqual(["Archive/Note", "Projects/Note"]);
    expect(browsed).toBe(true);
    expect(buttons).toHaveLength(3);
  });

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

  it("renders an external link indicator only for off-site links", () => {
    const page = {
      ...samplePage,
      contentMarkdown: "Internal [Ada](/wiki/Ada) and external [Docs](https://example.com/docs)",
    };

    const markup = renderToStaticMarkup(
      createElement(
        WikiConfigProvider as never,
        { config: DEFAULT_WIKI_OS_CONFIG },
        createElement(
          MemoryRouter,
          undefined,
          createElement(NoteViewer, { page, onNavigateNote: () => {} }),
        ),
      ),
    );

    expect(markup).toContain('href="https://example.com/docs"');
    expect(markup).toContain('aria-label="Docs (opens external site)"');
    expect(markup).toContain('class="note-link-external-indicator"');
    expect(markup).toContain("↗");
    expect(markup).not.toContain('href="/wiki/Ada" aria-label="Ada (opens external site)"');
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
});
