import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { ExplorerPage } from "../src/lib/wiki-shared";
import {
  EMPTY_EXPLORER_WORKSPACE,
  EXPLORER_STORAGE_KEY,
  activateExplorerTab,
  buildExplorerTree,
  closeExplorerTab,
  closeOtherExplorerTabs,
  collectFolderPaths,
  filterExplorerPages,
  flattenVisibleTree,
  openExplorerTab,
  parseExplorerWorkspace,
  serializeExplorerWorkspace,
} from "../src/client/explorer-model";
import type {
  ExplorerFolder,
  ExplorerTab,
  ExplorerWorkspace,
} from "../src/client/explorer-model";

function assertReadonlyExplorerContracts(tab: ExplorerTab, workspace: ExplorerWorkspace) {
  // @ts-expect-error ExplorerTab fields are immutable.
  tab.slug = "changed";
  // @ts-expect-error ExplorerTab fields are immutable.
  tab.title = "Changed";
  // @ts-expect-error ExplorerTab fields are immutable.
  tab.file = "Changed.md";
  // @ts-expect-error ExplorerWorkspace tabs cannot be replaced.
  workspace.tabs = [];
  // @ts-expect-error ExplorerWorkspace tabs cannot be mutated.
  workspace.tabs.push(tab);
  // @ts-expect-error ExplorerWorkspace activeSlug is immutable.
  workspace.activeSlug = null;
}

void assertReadonlyExplorerContracts;

describe("explorer route registration", () => {
  it("registers the lazy explorer route before the wiki route", () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL("../src/client/router.tsx", import.meta.url)),
      "utf8",
    );
    const explorerPathIndex = routerSource.indexOf('path: "/explorer/*"');
    const explorerImportIndex = routerSource.indexOf('import("./routes/explorer-route")');
    const wikiPathIndex = routerSource.indexOf('path: "/wiki/*"');

    expect(explorerPathIndex).toBeGreaterThan(-1);
    expect(explorerImportIndex).toBeGreaterThan(explorerPathIndex);
    expect(wikiPathIndex).toBeGreaterThan(explorerImportIndex);
  });

  it("preserves already-decoded literal percent data and encodes URL segments once", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      normalizeExplorerSlug?: (splat: string | undefined) => string;
      encodeExplorerRouteSlug?: (slug: string) => string;
      encodeExplorerApiSlug?: (slug: string) => string;
    };

    expect(routeModule.normalizeExplorerSlug).toBeTypeOf("function");
    expect(routeModule.encodeExplorerRouteSlug).toBeTypeOf("function");
    expect(routeModule.encodeExplorerApiSlug).toBeTypeOf("function");
    expect(routeModule.normalizeExplorerSlug!("folder/literal%20data")).toBe(
      "folder/literal%20data",
    );
    expect(routeModule.encodeExplorerRouteSlug!("folder/literal%20data")).toBe(
      "folder/literal%2520data",
    );
    expect(routeModule.encodeExplorerApiSlug!("folder/literal%20data")).toBe(
      "folder/literal%252520data",
    );
  });

  it("navigates only for active-tab changes or route synchronization", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      shouldNavigateExplorerTransition?: (
        current: ExplorerWorkspace,
        next: ExplorerWorkspace,
        routeSlug: string | null,
      ) => boolean;
    };
    const alpha = { slug: "alpha", title: "Alpha", file: "Alpha.md" };
    const beta = { slug: "beta", title: "Beta", file: "Beta.md" };
    const current = { tabs: [alpha, beta], activeSlug: alpha.slug };
    const noOpActivation = activateExplorerTab(current, alpha.slug);
    const inactiveClose = closeExplorerTab(current, beta.slug);
    const activeChange = activateExplorerTab(current, beta.slug);

    expect(routeModule.shouldNavigateExplorerTransition).toBeTypeOf("function");
    expect(routeModule.shouldNavigateExplorerTransition!(current, noOpActivation, "alpha")).toBe(false);
    expect(routeModule.shouldNavigateExplorerTransition!(current, inactiveClose, "alpha")).toBe(false);
    expect(routeModule.shouldNavigateExplorerTransition!(current, activeChange, "alpha")).toBe(true);
    expect(routeModule.shouldNavigateExplorerTransition!(current, noOpActivation, "beta")).toBe(true);
  });

  it("supports automatic-activation keyboard movement and complete tab relationships", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      getNextExplorerTabIndex?: (
        key: string,
        currentIndex: number,
        tabCount: number,
      ) => number | null;
    };
    const routerSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeModule.getNextExplorerTabIndex).toBeTypeOf("function");
    expect(routeModule.getNextExplorerTabIndex!("ArrowRight", 2, 3)).toBe(0);
    expect(routeModule.getNextExplorerTabIndex!("ArrowLeft", 0, 3)).toBe(2);
    expect(routeModule.getNextExplorerTabIndex!("Home", 2, 3)).toBe(0);
    expect(routeModule.getNextExplorerTabIndex!("End", 0, 3)).toBe(2);
    expect(routeModule.getNextExplorerTabIndex!("Enter", 1, 3)).toBeNull();
    expect(routerSource).toContain('role="tabpanel"');
    expect(routerSource).toContain("aria-controls={explorerPanelId(tab.slug)}");
    expect(routerSource).toContain("aria-labelledby={explorerTabId(tab.slug)}");
    expect(routerSource).toContain("tabIndex={active || (!workspace.activeSlug && index === 0) ? 0 : -1}");
    expect(routerSource).toContain("hidden={!active}");
  });

  it("never exposes reader state belonging to a previously active slug", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      selectExplorerReaderState?: (
        activeSlug: string | null,
        state: { slug: string | null; status: string },
      ) => { slug: string | null; status: string };
    };
    const alphaReady = { slug: "alpha", status: "ready" };

    expect(routeModule.selectExplorerReaderState).toBeTypeOf("function");
    expect(routeModule.selectExplorerReaderState!("alpha", alphaReady)).toBe(alphaReady);
    expect(routeModule.selectExplorerReaderState!("beta", alphaReady)).toEqual({
      slug: "beta",
      status: "loading",
    });
    expect(routeModule.selectExplorerReaderState!(null, alphaReady)).toEqual({
      slug: null,
      status: "idle",
    });
  });

  it("guards markdown self-links and restores focus after tab removal", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );

    expect(routeSource).toContain("onWikiLink={selectSlug}");
    expect(routeSource).not.toContain("onWikiLink={(encodedSlug) => navigate");
    expect(routeSource).toContain("const tabRefs = useRef(new Map<string, HTMLButtonElement>())");
    expect(routeSource).toContain("requestAnimationFrame(() =>");
    expect(routeSource).toContain("tabRefs.current.get(workspace.activeSlug)?.focus()");
    expect(routeSource).toContain("fallbackFocusRef.current?.focus()");
  });

  it("adds explorer entrypoints and polished responsive sidebar affordances", () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );
    const searchBoxSource = readFileSync(
      fileURLToPath(new URL("../src/components/search-box.tsx", import.meta.url)),
      "utf8",
    );
    const globalsSource = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(searchBoxSource).toContain('to="/explorer"');
    expect(routeSource).toContain('aria-label="Filter notes"');
    expect(routeSource).toContain('aria-label="Expand all folders"');
    expect(routeSource).toContain('aria-label="Collapse all folders"');
    expect(routeSource).toContain('aria-label="Toggle note tree"');
    expect(routeSource).toContain("explorer-sidebar-backdrop");
    expect(routeSource).toContain("prefers-reduced-motion: reduce");
    expect(routeSource).toContain('useMediaQuery("(prefers-reduced-motion: reduce)")');
    expect(routeSource).toContain('aria-controls="explorer-sidebar"');
    expect(routeSource).toContain('aria-expanded={sidebarOpen}');
    expect(globalsSource).toContain(".explorer-scrollbar");
    expect(globalsSource).toContain(".explorer-sidebar-backdrop");
  });

  it("removes the closed mobile drawer from focus while preserving desktop interactivity", async () => {
    const routeSource = readFileSync(
      fileURLToPath(new URL("../src/client/routes/explorer-route.tsx", import.meta.url)),
      "utf8",
    );
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      isExplorerSidebarInteractive?: (sidebarOpen: boolean, isDesktop: boolean) => boolean;
    };

    expect(routeModule.isExplorerSidebarInteractive).toBeTypeOf("function");
    expect(routeModule.isExplorerSidebarInteractive!(false, false)).toBe(false);
    expect(routeModule.isExplorerSidebarInteractive!(true, false)).toBe(true);
    expect(routeModule.isExplorerSidebarInteractive!(false, true)).toBe(true);
    expect(routeSource).toContain('useMediaQuery("(min-width: 768px)")');
    expect(routeSource).toContain('sidebarRef.current?.setAttribute("inert", "")');
    expect(routeSource).toContain('sidebarRef.current?.removeAttribute("inert")');
    expect(routeSource).toContain('aria-hidden={!sidebarInteractive}');
    expect(routeSource).toContain("toggleButtonRef.current?.focus()");
    expect(routeSource).toContain("sidebarRef.current?.contains(document.activeElement)");
  });

  it("canonicalizes encoded metadata and restored tabs without corrupting literal percent data", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      normalizeExplorerSlug?: (splat: string | undefined) => string;
      normalizeExplorerPages?: (pages: ExplorerPage[]) => ExplorerPage[];
      normalizeExplorerWorkspaceSlugs?: (
        workspace: ExplorerWorkspace,
      ) => ExplorerWorkspace;
      encodeExplorerRouteSlug?: (slug: string) => string;
      encodeExplorerApiSlug?: (slug: string) => string;
    };
    const metadata: ExplorerPage[] = [
      {
        file: "notes/Reading People.md",
        slug: "notes/Reading%20People",
        title: "Reading People",
        modifiedAt: 1,
      },
      {
        file: "notes/Literal%20Name.md",
        slug: "notes/Literal%2520Name",
        title: "Literal percent",
        modifiedAt: 2,
      },
    ];
    const restored: ExplorerWorkspace = {
      tabs: [
        { ...metadata[0] },
        { ...metadata[0], slug: "notes/Reading People" },
        { ...metadata[1] },
      ],
      activeSlug: "notes/Literal%2520Name",
    };

    expect(routeModule.normalizeExplorerPages).toBeTypeOf("function");
    expect(routeModule.normalizeExplorerWorkspaceSlugs).toBeTypeOf("function");
    expect(routeModule.normalizeExplorerSlug).toBeTypeOf("function");
    expect(routeModule.encodeExplorerRouteSlug).toBeTypeOf("function");
    expect(routeModule.encodeExplorerApiSlug).toBeTypeOf("function");
    const normalizedPages = routeModule.normalizeExplorerPages!(metadata);
    const normalizedWorkspace = routeModule.normalizeExplorerWorkspaceSlugs!(restored);

    expect(normalizedPages.map((page) => page.slug)).toEqual([
      "notes/Reading People",
      "notes/Literal%20Name",
    ]);
    expect(normalizedWorkspace).toEqual({
      tabs: [
        { slug: "notes/Reading People", title: "Reading People", file: "notes/Reading People.md" },
        { slug: "notes/Literal%20Name", title: "Literal percent", file: "notes/Literal%20Name.md" },
      ],
      activeSlug: "notes/Literal%20Name",
    });
    expect(openExplorerTab(normalizedWorkspace, normalizedPages[0])).toEqual({
      tabs: normalizedWorkspace.tabs,
      activeSlug: "notes/Reading People",
    });
    expect(
      normalizedPages.find(
        (page) => page.slug === routeModule.normalizeExplorerSlug!("notes/Reading People"),
      ),
    ).toBe(normalizedPages[0]);
    expect(routeModule.encodeExplorerRouteSlug!("notes/Reading People")).toBe(
      "notes/Reading%20People",
    );
    expect(routeModule.encodeExplorerApiSlug!("notes/Reading People")).toBe(
      "notes/Reading%2520People",
    );
    expect(routeModule.encodeExplorerRouteSlug!("notes/Literal%20Name")).toBe(
      "notes/Literal%2520Name",
    );
    expect(routeModule.encodeExplorerApiSlug!("notes/Literal%20Name")).toBe(
      "notes/Literal%252520Name",
    );
    expect(routeModule.encodeExplorerRouteSlug!("guides/nested/Alpha")).toBe(
      "guides/nested/Alpha",
    );
    expect(routeModule.encodeExplorerApiSlug!("guides/nested/Alpha")).toBe(
      "guides/nested/Alpha",
    );
  });

  it("survives unavailable and quota-limited localStorage", async () => {
    const routeModule = (await import("../src/client/routes/explorer-route")) as unknown as {
      readExplorerWorkspaceStorage?: (storage: { getItem(key: string): string | null }) => ExplorerWorkspace;
      writeExplorerWorkspaceStorage?: (
        storage: { setItem(key: string, value: string): void },
        workspace: ExplorerWorkspace,
      ) => boolean;
    };
    const unavailable = {
      getItem() {
        throw new Error("storage unavailable");
      },
    };
    const quotaLimited = {
      setItem() {
        throw new Error("quota exceeded");
      },
    };

    expect(routeModule.readExplorerWorkspaceStorage).toBeTypeOf("function");
    expect(routeModule.writeExplorerWorkspaceStorage).toBeTypeOf("function");
    expect(routeModule.readExplorerWorkspaceStorage!(unavailable)).toEqual(
      EMPTY_EXPLORER_WORKSPACE,
    );
    expect(
      routeModule.writeExplorerWorkspaceStorage!(
        quotaLimited,
        EMPTY_EXPLORER_WORKSPACE,
      ),
    ).toBe(false);
  });
});

const pages: ExplorerPage[] = [
  { file: "Root.md", slug: "Root", title: "Root", modifiedAt: 1 },
  { file: "guides/Zeta.md", slug: "guides/Zeta", title: "Zeta", modifiedAt: 2 },
  {
    file: "guides/nested/Alpha.md",
    slug: "guides/nested/Alpha",
    title: "Alpha",
    modifiedAt: 3,
  },
];

describe("explorer model", () => {
  it("builds nested folders while preserving complete page metadata", () => {
    const tree = buildExplorerTree(pages);

    expect(tree.pages).toEqual([pages[0]]);
    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0]).toMatchObject({ name: "guides", path: "guides" });
    expect(tree.folders[0].pages).toEqual([pages[1]]);
    expect(tree.folders[0].folders[0]).toMatchObject({
      name: "nested",
      path: "guides/nested",
      pages: [pages[2]],
    });
  });

  it("builds a broad tree without scanning sibling arrays", () => {
    const broadPages: ExplorerPage[] = Array.from({ length: 256 }, (_, index) => {
      const folder = `folder-${index.toString().padStart(3, "0")}`;
      return {
        file: `${folder}/Note.md`,
        slug: `${folder}/Note`,
        title: `Note ${index}`,
        modifiedAt: index,
      };
    });
    const findSpy = vi.spyOn(Array.prototype, "find");

    const tree = buildExplorerTree(broadPages);
    const siblingScans = findSpy.mock.calls.length;
    findSpy.mockRestore();

    expect(siblingScans).toBe(0);
    expect(tree.folders).toHaveLength(256);
    expect(tree.folders.flatMap((folder) => folder.pages)).toEqual(broadPages);
  });

  it("flattens expanded folders with recursive counts and deterministic ordering", () => {
    const rows = flattenVisibleTree(
      buildExplorerTree(pages),
      new Set(["guides", "guides/nested"]),
    );

    expect(rows).toEqual([
      { kind: "folder", path: "guides", name: "guides", depth: 0, count: 2 },
      { kind: "folder", path: "guides/nested", name: "nested", depth: 1, count: 1 },
      { kind: "page", page: pages[2], depth: 2 },
      { kind: "page", page: pages[1], depth: 1 },
      { kind: "page", page: pages[0], depth: 0 },
    ]);
  });

  it("reads each folder's pages at most once for counts and once for rows", () => {
    const countPages: ExplorerPage[] = [
      { file: "Root.md", slug: "Root", title: "Root", modifiedAt: 1 },
      { file: "a/A.md", slug: "a/A", title: "A", modifiedAt: 2 },
      { file: "a/b/B.md", slug: "a/b/B", title: "B", modifiedAt: 3 },
      { file: "a/b/c/C.md", slug: "a/b/c/C", title: "C", modifiedAt: 4 },
    ];
    const tree = buildExplorerTree(countPages);
    const pageReads = new Map<string, number>();

    function trackPageReads(folder: ExplorerFolder) {
      const folderPages = folder.pages;
      Object.defineProperty(folder, "pages", {
        configurable: true,
        get() {
          pageReads.set(folder.path, (pageReads.get(folder.path) ?? 0) + 1);
          return folderPages;
        },
      });
      folder.folders.forEach(trackPageReads);
    }

    trackPageReads(tree);
    const rows = flattenVisibleTree(tree, new Set(["a", "a/b", "a/b/c"]));

    expect(rows.filter((row) => row.kind === "folder").map((row) => row.count)).toEqual([3, 2, 1]);
    expect([...pageReads.values()].every((reads) => reads <= 2)).toBe(true);
  });

  it("sorts folders before notes at each level and names locale-aware with base sensitivity", () => {
    const shuffled = [
      { file: "zulu.md", slug: "zulu", title: "zulu", modifiedAt: 4 },
      { file: "Beta/Page.md", slug: "Beta/Page", title: "Page", modifiedAt: 5 },
      { file: "alpha.md", slug: "alpha", title: "alpha", modifiedAt: 6 },
      { file: "áccent.md", slug: "accent", title: "áccent", modifiedAt: 7 },
    ];

    const rows = flattenVisibleTree(buildExplorerTree(shuffled), new Set());

    expect(rows.map((row) => (row.kind === "folder" ? row.name : row.page.title))).toEqual([
      "Beta",
      "áccent",
      "alpha",
      "zulu",
    ]);
  });

  it("preserves source order for names that are equivalent at base sensitivity", () => {
    const baseEquivalentPages = [
      { file: "résumé.md", slug: "resume-accented", title: "résumé", modifiedAt: 8 },
      { file: "resume.md", slug: "resume", title: "resume", modifiedAt: 9 },
    ];

    const rows = flattenVisibleTree(buildExplorerTree(baseEquivalentPages), new Set());

    expect(rows.map((row) => (row.kind === "page" ? row.page.title : row.name))).toEqual([
      "résumé",
      "resume",
    ]);
  });

  it("filters title and extension-free file path case-insensitively", () => {
    expect(filterExplorerPages(pages, "alpha")).toEqual([pages[2]]);
    expect(filterExplorerPages(pages, "GUIDES")).toEqual([pages[1], pages[2]]);
  });

  it("returns all pages for blank queries without mutating the input", () => {
    const result = filterExplorerPages(pages, "  \t");

    expect(result).toEqual(pages);
    expect(result).not.toBe(pages);
    expect(pages.map((page) => page.file)).toEqual([
      "Root.md",
      "guides/Zeta.md",
      "guides/nested/Alpha.md",
    ]);
  });

  it("collects every nested folder path", () => {
    expect(collectFolderPaths(buildExplorerTree(pages))).toEqual([
      "guides",
      "guides/nested",
    ]);
  });
});

describe("explorer workspace", () => {
  const alpha: ExplorerTab = { slug: "alpha", title: "Alpha", file: "Alpha.md" };
  const beta: ExplorerTab = { slug: "beta", title: "Beta", file: "Beta.md" };
  const gamma: ExplorerTab = { slug: "gamma", title: "Gamma", file: "Gamma.md" };

  function workspace(
    tabs: readonly ExplorerTab[],
    activeSlug: string | null,
  ): ExplorerWorkspace {
    return { tabs, activeSlug };
  }

  it("opens, deduplicates, and activates tabs in deterministic order", () => {
    const openedAlpha = openExplorerTab(EMPTY_EXPLORER_WORKSPACE, {
      ...alpha,
      modifiedAt: 1,
    });
    const reopenedAlpha = openExplorerTab(
      workspace([alpha, beta], beta.slug),
      alpha,
    );
    const openedBeta = openExplorerTab(openedAlpha, beta);

    expect(openedAlpha).toEqual(workspace([alpha], alpha.slug));
    expect(reopenedAlpha).toEqual(workspace([alpha, beta], alpha.slug));
    expect(openedBeta).toEqual(workspace([alpha, beta], beta.slug));
  });

  it("accepts a complete ExplorerPage and preserves an already-active workspace", () => {
    const initial = workspace([alpha], alpha.slug);

    expect(
      openExplorerTab(initial, {
        file: alpha.file,
        slug: alpha.slug,
        title: alpha.title,
        modifiedAt: 1,
      }),
    ).toBe(initial);
  });

  it("activates existing tabs and ignores unknown slugs", () => {
    const initial = workspace([alpha, beta], alpha.slug);

    expect(activateExplorerTab(initial, beta.slug)).toEqual(
      workspace([alpha, beta], beta.slug),
    );
    expect(activateExplorerTab(initial, "unknown")).toBe(initial);
  });

  it("preserves the workspace when activating the already-active tab", () => {
    const initial = workspace([alpha, beta], alpha.slug);

    expect(activateExplorerTab(initial, alpha.slug)).toBe(initial);
  });

  it("closes an inactive tab without changing the active tab", () => {
    expect(closeExplorerTab(workspace([alpha, beta], alpha.slug), beta.slug)).toEqual(
      workspace([alpha], alpha.slug),
    );
  });

  it("selects the immediate left tab when closing an active tab", () => {
    expect(closeExplorerTab(workspace([alpha, beta], beta.slug), beta.slug)).toEqual(
      workspace([alpha], alpha.slug),
    );
    expect(
      closeExplorerTab(workspace([alpha, beta, gamma], beta.slug), beta.slug),
    ).toEqual(workspace([alpha, gamma], alpha.slug));
  });

  it("selects the next tab when closing the active first tab", () => {
    expect(
      closeExplorerTab(workspace([alpha, beta, gamma], alpha.slug), alpha.slug),
    ).toEqual(workspace([beta, gamma], beta.slug));
  });

  it("clears the active slug when closing the final tab", () => {
    expect(closeExplorerTab(workspace([alpha], alpha.slug), alpha.slug)).toEqual(
      EMPTY_EXPLORER_WORKSPACE,
    );
  });

  it("preserves the workspace when closing an unknown tab", () => {
    const initial = workspace([alpha, beta], alpha.slug);

    expect(closeExplorerTab(initial, "unknown")).toBe(initial);
  });

  it("closes other tabs and activates the retained existing tab", () => {
    const initial = workspace([alpha, beta, gamma], alpha.slug);

    expect(closeOtherExplorerTabs(initial, beta.slug)).toEqual(
      workspace([beta], beta.slug),
    );
    expect(closeOtherExplorerTabs(initial, "unknown")).toBe(initial);
  });

  it("preserves a sole requested tab when closing other tabs", () => {
    const initial = workspace([alpha], alpha.slug);

    expect(closeOtherExplorerTabs(initial, alpha.slug)).toBe(initial);
  });

  it("serializes version one and restores valid workspaces", () => {
    const initial = workspace([alpha, beta], beta.slug);
    const serialized = serializeExplorerWorkspace(initial);

    expect(EXPLORER_STORAGE_KEY).toBe("wiki-os:explorer-workspace");
    expect(JSON.parse(serialized)).toEqual({ version: 1, ...initial });
    expect(parseExplorerWorkspace(serialized)).toEqual(initial);
  });

  it.each(["{", "null", "[]", JSON.stringify({ version: 99, tabs: [] })])(
    "falls back safely for invalid persisted input %s",
    (serialized) => {
      expect(parseExplorerWorkspace(serialized)).toEqual(EMPTY_EXPLORER_WORKSPACE);
    },
  );

  it.each([
    JSON.stringify({ version: 1, activeSlug: null }),
    JSON.stringify({ version: 1, tabs: null, activeSlug: null }),
    JSON.stringify({ version: 1, tabs: {}, activeSlug: null }),
  ])("falls back safely when tabs are missing or not an array: %s", (serialized) => {
    expect(parseExplorerWorkspace(serialized)).toEqual(EMPTY_EXPLORER_WORKSPACE);
  });

  it("discards malformed tabs while retaining valid tabs", () => {
    const serialized = JSON.stringify({
      version: 1,
      tabs: [
        alpha,
        null,
        { slug: "", title: "Empty slug", file: "Empty.md" },
        { slug: "missing-title", file: "Missing.md" },
        { slug: "wrong-file", title: "Wrong file", file: 42 },
        beta,
      ],
      activeSlug: beta.slug,
    });

    expect(parseExplorerWorkspace(serialized)).toEqual(workspace([alpha, beta], beta.slug));
  });

  it("discards tabs with whitespace-only slug, title, or file fields", () => {
    const serialized = JSON.stringify({
      version: 1,
      tabs: [
        { slug: " \t", title: "Whitespace slug", file: "Slug.md" },
        { slug: "whitespace-title", title: "\n ", file: "Title.md" },
        { slug: "whitespace-file", title: "Whitespace file", file: "   " },
        alpha,
      ],
      activeSlug: "whitespace-title",
    });

    expect(parseExplorerWorkspace(serialized)).toEqual(workspace([alpha], alpha.slug));
  });

  it("removes duplicate slugs while preserving the first tab", () => {
    const duplicateAlpha = { slug: alpha.slug, title: "Other Alpha", file: "Other.md" };
    const serialized = JSON.stringify({
      version: 1,
      tabs: [alpha, duplicateAlpha, beta],
      activeSlug: alpha.slug,
    });

    expect(parseExplorerWorkspace(serialized)).toEqual(workspace([alpha, beta], alpha.slug));
  });

  it("accepts activeSlug only when retained and otherwise selects the first tab", () => {
    expect(
      parseExplorerWorkspace(
        JSON.stringify({ version: 1, tabs: [alpha, beta], activeSlug: beta.slug }),
      ),
    ).toEqual(workspace([alpha, beta], beta.slug));
    expect(
      parseExplorerWorkspace(
        JSON.stringify({ version: 1, tabs: [alpha, beta], activeSlug: "unknown" }),
      ),
    ).toEqual(workspace([alpha, beta], alpha.slug));
    expect(
      parseExplorerWorkspace(JSON.stringify({ version: 1, tabs: [], activeSlug: alpha.slug })),
    ).toEqual(EMPTY_EXPLORER_WORKSPACE);
  });

  it("allocates fallbacks so callers cannot mutate the shared empty workspace", () => {
    const first = parseExplorerWorkspace("not json");
    (first.tabs as ExplorerTab[]).push(alpha);
    const second = parseExplorerWorkspace("not json");

    expect(first).not.toBe(EMPTY_EXPLORER_WORKSPACE);
    expect(first.tabs).toEqual([alpha]);
    expect(second).toEqual(EMPTY_EXPLORER_WORKSPACE);
    expect(second.tabs).not.toBe(first.tabs);
    expect(EMPTY_EXPLORER_WORKSPACE).toEqual({ tabs: [], activeSlug: null });
  });

  it("does not mutate workspace inputs", () => {
    const initial = workspace([alpha, beta, gamma], beta.slug);
    const snapshot = structuredClone(initial);

    openExplorerTab(initial, alpha);
    activateExplorerTab(initial, gamma.slug);
    closeExplorerTab(initial, alpha.slug);
    closeOtherExplorerTabs(initial, beta.slug);
    serializeExplorerWorkspace(initial);

    expect(initial).toEqual(snapshot);
  });

  it("keeps prior workspace and tab objects unchanged across transitions", () => {
    const frozenAlpha = Object.freeze({ ...alpha });
    const frozenBeta = Object.freeze({ ...beta });
    const frozenGamma = Object.freeze({ ...gamma });
    const tabs = Object.freeze([frozenAlpha, frozenBeta, frozenGamma]);
    const initial: ExplorerWorkspace = Object.freeze({ tabs, activeSlug: beta.slug });

    const transitions = [
      openExplorerTab(initial, alpha),
      activateExplorerTab(initial, gamma.slug),
      closeExplorerTab(initial, alpha.slug),
      closeOtherExplorerTabs(initial, beta.slug),
    ];

    for (const next of transitions) {
      expect(next).not.toBe(initial);
      expect(next.tabs).not.toBe(initial.tabs);
    }
    expect(initial).toEqual({ tabs: [alpha, beta, gamma], activeSlug: beta.slug });
    expect(initial.tabs[0]).toBe(frozenAlpha);
    expect(initial.tabs[1]).toBe(frozenBeta);
    expect(initial.tabs[2]).toBe(frozenGamma);
  });
});
