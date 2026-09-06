import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createQueryFixture } from "./helpers/wiki-db";
import { reconcileIndexWithDisk } from "../src/lib/wiki-indexer";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";

it("leaves an unchanged index untouched and supports an explicit repair", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-reconcile-"));
  const { db } = createQueryFixture();
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    await writeFile(path.join(root, "Home.md"), "[[Note]]");
    await writeFile(path.join(root, "Note.md"), "alpha");
    const deps = {
      syncRuntimeSettings: async () => {}, requireWikiRoot: () => root,
      requireIndexDbPath: () => ":memory:", requireDb: () => db,
      getWikiEnvironmentConfig: async () => DEFAULT_WIKI_OS_CONFIG,
      getPersonOverride: () => null,
    };
    await reconcileIndexWithDisk(deps);
    const firstSeen = () => db.prepare("SELECT file, first_seen_at FROM pages ORDER BY file").all();
    const originalFirstSeen = firstSeen();
    expect(originalFirstSeen).toEqual([
      { file: "Home.md", first_seen_at: 1000 },
      { file: "Note.md", first_seen_at: 1000 },
    ]);
    now.mockReturnValue(2000);
    const changes = () => (db.prepare("SELECT total_changes() AS n").get() as {n: number}).n;
    const before = changes();
    expect(await reconcileIndexWithDisk(deps)).toEqual({ upserted: 0, deleted: 0 });
    expect(changes()).toBe(before);
    db.prepare("UPDATE pages SET backlink_count = 99").run();
    await reconcileIndexWithDisk(deps, { forceAll: true });
    expect(firstSeen()).toEqual(originalFirstSeen);
    await writeFile(path.join(root, "Note.md"), "updated note");
    await reconcileIndexWithDisk(deps);
    expect(firstSeen()).toEqual(originalFirstSeen);
    expect(db.prepare("SELECT backlink_count FROM pages WHERE file = 'Note.md'").get()).toEqual({ backlink_count: 1 });
  } finally { now.mockRestore(); db.close(); await rm(root, { recursive: true, force: true }); }
});
