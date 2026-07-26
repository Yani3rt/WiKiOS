import { describe, expect, it, vi } from "vitest";

import { loadRecentlyVisitedPages } from "../src/client/routes/home-route";
import type { ExplorerPage } from "../src/lib/wiki-shared";

const explorerPages: ExplorerPage[] = [
  {
    file: "Development/Git.md",
    slug: "stale-api-slug",
    title: "Git",
    modifiedAt: 3,
  },
  {
    file: "Inbox/Tasks.md",
    slug: "stale-api-slug",
    title: "Tasks",
    modifiedAt: 2,
  },
];

describe("Home recently visited loader", () => {
  it("skips Explorer loading when local history is empty", async () => {
    const loadExplorer = vi.fn<() => Promise<ExplorerPage[]>>();

    await expect(loadRecentlyVisitedPages([], loadExplorer)).resolves.toEqual([]);
    expect(loadExplorer).not.toHaveBeenCalled();
  });

  it("resolves current pages in stored order and omits stale slugs", async () => {
    const loadExplorer = vi.fn(async () => explorerPages);

    await expect(
      loadRecentlyVisitedPages(
        ["Inbox/Tasks", "missing", "Development/Git"],
        loadExplorer,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ title: "Tasks", slug: "Inbox/Tasks" }),
      expect.objectContaining({ title: "Git", slug: "Development/Git" }),
    ]);
  });

  it("degrades to an empty list when Explorer loading fails", async () => {
    const loadExplorer = vi.fn(async (): Promise<ExplorerPage[]> => {
      throw new Error("offline");
    });

    await expect(
      loadRecentlyVisitedPages(["Inbox/Tasks"], loadExplorer),
    ).resolves.toEqual([]);
  });
});
