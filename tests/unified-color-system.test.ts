import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("unified teal color system", () => {
  it("defines shared OKLCH brand tokens and reusable route chrome", () => {
    const styles = source("../src/client/globals.css");

    expect(styles).toContain("--brand-deep-teal: oklch(");
    expect(styles).toContain("--brand-canvas: oklch(");
    expect(styles).toContain("--brand-accent: oklch(");
    expect(styles).toContain(".app-route-shell");
    expect(styles).toContain(".app-route-header");
    expect(styles).toContain(".app-primary-action");
    expect(styles).toContain(".app-secondary-action");
  });

  it("applies the shared shell and header to every full-page route", () => {
    const routeFiles = [
      "../src/client/routes/explorer-route.tsx",
      "../src/client/routes/graph-route.tsx",
      "../src/client/routes/stats-route.tsx",
      "../src/client/routes/wiki-route.tsx",
      "../src/client/routes/setup-route.tsx",
    ];

    for (const routeFile of routeFiles) {
      const routeSource = source(routeFile);
      expect(routeSource, routeFile).toContain("app-route-shell");
      expect(routeSource, routeFile).toContain("app-route-header");
    }

    expect(source("../src/components/error-state-view.tsx")).toContain("app-state-view");
    expect(source("../src/components/not-found-view.tsx")).toContain("app-state-view");
  });

  it("removes rejected decorative color treatments from Setup and the command palette", () => {
    const setupSource = source("../src/client/routes/setup-route.tsx");
    const styles = source("../src/client/globals.css");
    const paletteStyles = styles.slice(
      styles.indexOf(".command-palette-backdrop"),
      styles.indexOf(".explorer-note-viewer-shell"),
    );

    expect(setupSource).not.toContain("radial-gradient");
    expect(paletteStyles).not.toContain("backdrop-filter");
    expect(paletteStyles).not.toContain("linear-gradient");
    expect(paletteStyles).not.toContain('.command-palette-result[aria-selected="true"]::before');
  });

  it("keeps graph search in the header toolbar on mobile only", () => {
    const graphSource = source("../src/client/routes/graph-route.tsx");
    const styles = source("../src/client/globals.css");
    const headerStart = graphSource.indexOf('<header className="app-route-header');
    const headerEnd = graphSource.indexOf("</header>", headerStart);
    const searchPlacement = graphSource.indexOf("<GraphSearch", headerStart);

    expect(headerStart).toBeGreaterThan(-1);
    expect(searchPlacement).toBeGreaterThan(headerStart);
    expect(searchPlacement).toBeLessThan(headerEnd);
    expect(graphSource).toContain("pb-[4.5rem]");
    expect(graphSource).toContain("sm:h-16");
    expect(graphSource).toContain("sm:py-0");
    expect(graphSource).toContain("md:px-5");
    expect(graphSource).not.toContain("sm:pb-4");
    expect(graphSource).not.toContain("sm:pt-[calc(env(safe-area-inset-top)+1.25rem)]");
    expect(graphSource).toContain("sm:left-6 sm:right-auto sm:w-80");
    expect(graphSource).toMatch(/app-route-header-control hidden[^"]*sm:inline-flex/);
    expect(graphSource).toMatch(/app-route-header-brand hidden[^"]*sm:flex/);
    expect(graphSource).toContain("order-last");
    expect(styles).toContain(".graph-search {");
    expect(styles).toContain("top: calc(env(safe-area-inset-top) + 1.625rem);");
    expect(styles).toContain("@media (min-width: 640px)");
    expect(graphSource).toContain(
      "sm:top-[calc(env(safe-area-inset-top)+4.75rem)]",
    );
    expect(graphSource).toContain("sm:max-h-[calc(100dvh-6rem)]");
    expect(graphSource).not.toContain("sm:top-[calc(env(safe-area-inset-top)+8.75rem)]");
  });

  it("keeps Sigma renderer colors in its supported hex or rgb formats", () => {
    const styles = source("../src/client/globals.css");
    const rendererTokens = [
      "graph-background",
      "graph-foreground",
      "graph-node-default",
      "graph-node-muted",
      "graph-edge-default",
      "graph-edge-muted",
      "graph-edge-outgoing",
      "graph-edge-incoming",
      "graph-label",
    ];

    for (const token of rendererTokens) {
      const value = styles.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim();
      expect(value, token).toMatch(/^(#[\da-f]{6}|rgba?\()/i);
    }
  });

  it("pages the graph node index from ten notes in groups of five", () => {
    const graphSource = source("../src/client/routes/graph-route.tsx");
    const modelSource = source("../src/client/graph-overview-model.ts");
    const listStart = graphSource.indexOf(
      '<ul className="graph-node-index-list',
    );
    const listEnd = graphSource.indexOf("</ul>", listStart);
    const loadMore = graphSource.indexOf("<span>Load more</span>", listStart);

    expect(modelSource).toContain("export const GRAPH_INDEX_INITIAL_VISIBLE_COUNT = 10;");
    expect(modelSource).toContain("export const GRAPH_INDEX_LOAD_MORE_COUNT = 5;");
    expect(graphSource).toContain("results.slice(0, visibleResultCount)");
    expect(graphSource).toContain("Load more");
    expect(graphSource).not.toContain("Show more");
    expect(graphSource).toContain("visibleResults.length < results.length");
    expect(loadMore).toBeGreaterThan(listStart);
    expect(loadMore).toBeLessThan(listEnd);
    expect(graphSource.slice(listStart, listEnd)).toContain(
      "text-[var(--graph-foreground)]",
    );
    expect(graphSource).toContain(
      "max-h-[14.25rem] sm:max-h-[min(62vh,34rem)]",
    );
  });

  it("adds a Home link above the graph fit control", () => {
    const graphSource = source("../src/client/routes/graph-route.tsx");
    const styles = source("../src/client/globals.css");
    const controlsStart = graphSource.indexOf("function GraphViewportControls");
    const controlsEnd = graphSource.indexOf("/* ── Search ── */", controlsStart);
    const controls = graphSource.slice(controlsStart, controlsEnd);
    const homeLink = controls.indexOf('aria-label="Home"');
    const fitControl = controls.indexOf('aria-label="Fit graph"');

    expect(graphSource).toContain("House,");
    expect(controls).toMatch(/<Link\s+to="\/"/);
    expect(homeLink).toBeGreaterThan(-1);
    expect(homeLink).toBeLessThan(fitControl);
    expect(controls).toContain("graph-toolbar-stack");
    expect(controls).toContain(
      "graph-surface graph-toolbar-home -mb-px rounded-b-none rounded-t-lg",
    );
    expect(controls).not.toContain("flex flex-col items-center gap-2");
    expect(controls).toContain("graph-toolbar-home");
    expect(styles).toContain(".graph-toolbar-home:hover");
    expect(styles).toContain("background: var(--graph-control-hover);");
  });

  it("animates mobile detail-card height changes without forcing desktop motion", () => {
    const graphSource = source("../src/client/routes/graph-route.tsx");

    expect(graphSource).toContain("useLayoutEffect");
    expect(graphSource).toContain("getGraphDetailHeightAnimation({");
    expect(graphSource).toContain(
      "panel.animate(heightAnimation.keyframes, heightAnimation.options)",
    );
    expect(graphSource).toContain('(prefers-reduced-motion: reduce)');
  });
});
