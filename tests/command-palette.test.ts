import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  commandPaletteExplorerPath,
  filterCommandPalettePages,
  getNextCommandPaletteIndex,
  isCommandPaletteShortcut,
  noteSlugFromPathname,
  normalizeCommandPalettePages,
  parseRecentNoteSlugs,
  promoteRecentNote,
  resolveCommandPalettePages,
  serializeRecentNoteSlugs,
} from "../src/client/command-palette-model";
import { CommandPalette } from "../src/components/command-palette";
import type { ExplorerPage } from "../src/lib/wiki-shared";

const pages: ExplorerPage[] = [
  {
    slug: "01 ai/Agent Config",
    title: "Agent Config",
    file: "01 ai/Agent Config.md",
    modifiedAt: 3,
  },
  {
    slug: "02 cheat-sheet/Git",
    title: "Git Commands",
    file: "02 cheat-sheet/Git.md",
    modifiedAt: 2,
  },
  { slug: "Inbox/TODO", title: "TODO", file: "Inbox/TODO.md", modifiedAt: 1 },
];

describe("command palette model", () => {
  it("keeps three unique recent note slugs in newest-first order", () => {
    expect(promoteRecentNote(["beta", "alpha", "gamma"], "alpha")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(promoteRecentNote(["gamma", "beta", "alpha"], "delta")).toEqual([
      "delta",
      "gamma",
      "beta",
    ]);
  });

  it("round-trips valid storage and rejects malformed storage", () => {
    const serialized = serializeRecentNoteSlugs(["alpha", "beta"]);

    expect(parseRecentNoteSlugs(serialized)).toEqual(["alpha", "beta"]);
    expect(parseRecentNoteSlugs('["alpha", "alpha", "beta", "gamma", "delta"]')).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(parseRecentNoteSlugs('{"bad":true}')).toEqual([]);
    expect(parseRecentNoteSlugs("not-json")).toEqual([]);
  });

  it("recognizes encoded wiki and explorer note routes", () => {
    expect(noteSlugFromPathname("/wiki/01%20ai/Agent%20Config")).toBe("01 ai/Agent Config");
    expect(noteSlugFromPathname("/explorer/Inbox/TODO")).toBe("Inbox/TODO");
    expect(noteSlugFromPathname("/graph")).toBeNull();
  });

  it("matches titles and paths case-insensitively", () => {
    expect(filterCommandPalettePages(pages, "agent").map((page) => page.title)).toEqual([
      "Agent Config",
    ]);
    expect(filterCommandPalettePages(pages, "cheat-sheet").map((page) => page.title)).toEqual([
      "Git Commands",
    ]);
  });

  it("recognizes Command-K and Control-K without accepting unrelated modifiers", () => {
    expect(
      isCommandPaletteShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: false }),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({ key: "K", metaKey: false, ctrlKey: true, altKey: false }),
    ).toBe(true);
    expect(
      isCommandPaletteShortcut({ key: "k", metaKey: false, ctrlKey: false, altKey: false }),
    ).toBe(false);
    expect(
      isCommandPaletteShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: true }),
    ).toBe(false);
  });

  it("wraps arrow-key selection and ignores other keys", () => {
    expect(getNextCommandPaletteIndex("ArrowDown", 2, 3)).toBe(0);
    expect(getNextCommandPaletteIndex("ArrowUp", 0, 3)).toBe(2);
    expect(getNextCommandPaletteIndex("Enter", 0, 3)).toBeNull();
    expect(getNextCommandPaletteIndex("ArrowDown", -1, 0)).toBeNull();
  });

  it("shows recent existing notes until a search query replaces them", () => {
    expect(
      resolveCommandPalettePages(pages, ["Inbox/TODO", "missing"], "").map(
        (page) => page.title,
      ),
    ).toEqual(["TODO"]);
    expect(
      resolveCommandPalettePages(pages, ["Inbox/TODO"], "agent").map(
        (page) => page.title,
      ),
    ).toEqual(["Agent Config"]);
  });

  it("normalizes API pages and encodes Explorer destinations segment by segment", () => {
    expect(normalizeCommandPalettePages(pages)[0].slug).toBe("01 ai/Agent Config");
    expect(commandPaletteExplorerPath("01 ai/Agent Config")).toBe(
      "/explorer/01%20ai/Agent%20Config",
    );
    expect(commandPaletteExplorerPath("literal%20name")).toBe(
      "/explorer/literal%2520name",
    );
  });
});

describe("command palette modal", () => {
  it("renders an accessible recent-notes dialog", () => {
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        open: true,
        pages,
        recentSlugs: ["01 ai/Agent Config"],
        status: "ready",
        onClose: vi.fn(),
        onRetry: vi.fn(),
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Search notes"');
    expect(markup).not.toContain("aria-labelledby");
    expect(markup).toContain("Recently opened");
    expect(markup).toContain("Agent Config");
    expect(markup).toContain("⌘K");
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
  });
});

describe("global command palette integration", () => {
  it("mounts one app shell around every application route", () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL("../src/client/router.tsx", import.meta.url)),
      "utf8",
    );
    const shellSource = readFileSync(
      fileURLToPath(new URL("../src/client/app-shell.tsx", import.meta.url)),
      "utf8",
    );

    expect(routerSource).toContain('import { AppShell } from "./app-shell"');
    expect(routerSource).toContain("Component: AppShell");
    expect(routerSource).toContain("children: [");
    expect(shellSource).toContain("<Outlet />");
    expect(shellSource).toContain("<CommandPalette");
    expect(shellSource).toContain('window.addEventListener("keydown"');
    expect(shellSource).toContain("noteSlugFromPathname(location.pathname)");
  });

  it("provides responsive, motion-safe palette styling", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
      "utf8",
    );

    expect(css).toContain(".command-palette-backdrop");
    expect(css).toContain(".command-palette-dialog");
    expect(css).toContain('.command-palette-result[aria-selected="true"]');
    expect(css).toContain("backdrop-filter: blur(");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
