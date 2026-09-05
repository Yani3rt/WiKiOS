import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createQueryFixture } from "./helpers/wiki-db";
import { reconcileIndexWithDisk } from "../src/lib/wiki-indexer";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";

it("leaves an unchanged index untouched and supports an explicit repair", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-reconcile-"));
  const { db } = createQueryFixture();
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
    const changes = () => (db.prepare("SELECT total_changes() AS n").get() as {n: number}).n;
    const before = changes();
    expect(await reconcileIndexWithDisk(deps)).toEqual({ upserted: 0, deleted: 0 });
    expect(changes()).toBe(before);
    db.prepare("UPDATE pages SET backlink_count = 99").run();
    await reconcileIndexWithDisk(deps, { forceAll: true });
    expect(db.prepare("SELECT backlink_count FROM pages WHERE file = 'Note.md'").get()).toEqual({ backlink_count: 1 });
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
