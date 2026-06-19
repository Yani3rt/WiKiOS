import { describe, expect, it } from "vitest";

import type { ExplorerPage } from "../src/lib/wiki-shared";
import {
  buildExplorerTree,
  collectFolderPaths,
  filterExplorerPages,
  flattenVisibleTree,
} from "../src/client/explorer-model";

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
