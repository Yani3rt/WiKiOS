import { describe, expect, it, vi } from "vitest";

import type { ExplorerPage } from "../src/lib/wiki-shared";
import {
  buildExplorerTree,
  collectFolderPaths,
  filterExplorerPages,
  flattenVisibleTree,
} from "../src/client/explorer-model";
import type { ExplorerFolder } from "../src/client/explorer-model";

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
