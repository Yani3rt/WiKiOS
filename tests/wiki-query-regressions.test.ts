import { afterEach, describe, expect, it } from "vitest";
import { searchWiki } from "../src/lib/wiki-queries";
import { createQueryFixture } from "./helpers/wiki-db";

const fixtures: ReturnType<typeof createQueryFixture>[] = [];
function fixture() {
  const value = createQueryFixture(); fixtures.push(value); return value;
}
afterEach(() => { for (const { db } of fixtures.splice(0)) if (db.open) db.close(); });

describe("search regressions", () => {
  it("matches repeated terms once without changing relevance", async () => {
    const { deps, addPage } = fixture(); addPage("Note.md");
    const single = await searchWiki(deps, "alpha");
    expect(single).toHaveLength(1);
    expect(await searchWiki(deps, "alpha ALPHA")).toEqual(single);
  });
  it("reports database failures instead of claiming there are no matches", async () => {
    const { db, deps } = fixture(); db.exec("DROP TABLE pages_fts");
    await expect(searchWiki(deps, "alpha")).rejects.toThrow();
  });
});

describe("link-index caching", () => {
  it("reuses the lookup for unchanged reads, then resolves newly added and removed notes", async () => {
    const { db, deps, state, addPage } = fixture();
    addPage("Home.md", "[[Note]]"); addPage("Folder/Note.md");
    const { getWikiPage } = await import("../src/lib/wiki-queries");
    const queries: string[] = [];
    const originalPrepare = db.prepare.bind(db);
    const { vi } = await import("vitest");
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => { queries.push(sql); return originalPrepare(sql); });
    expect((await getWikiPage(deps, ["Home"])).contentMarkdown).toContain("/wiki/Folder/Note");
    await getWikiPage(deps, ["Folder", "Note"]);
    expect(queries.filter(sql => sql === "SELECT file, slug, title FROM pages")).toHaveLength(1);
    addPage("Other/Note.md"); state.revision++;
    await expect(getWikiPage(deps, ["Note"])).rejects.toThrow("Multiple notes");
    db.prepare("DELETE FROM pages WHERE file = ?").run("Folder/Note.md"); state.revision++;
    expect((await getWikiPage(deps, ["Note"])).fileName).toBe("Other/Note.md");
  });
  it("does not share lookups across databases with equal revisions", async () => {
    const first = fixture(); const second = fixture();
    first.addPage("Old/Note.md"); second.addPage("New/Note.md");
    const { getWikiPage } = await import("../src/lib/wiki-queries");
    expect((await getWikiPage(first.deps, ["Note"])).fileName).toBe("Old/Note.md");
    first.state.db = second.db;
    expect((await getWikiPage(first.deps, ["Note"])).fileName).toBe("New/Note.md");
  });
});
