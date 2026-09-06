import { collectFrontmatterTopics, dedupeTopics } from "../../src/lib/wiki-classification";
import { parseWikiFrontmatter } from "../../src/lib/markdown";
import Database from "better-sqlite3";
import { runDbMigrations, upsertPageRecord } from "../../src/lib/wiki-db";
import { DEFAULT_WIKI_OS_CONFIG } from "../../src/lib/wiki-config";
import { createInitialWikiCacheState } from "../../src/lib/wiki-state";
import type { WikiQueryDependencies } from "../../src/lib/wiki-queries";

export function createQueryFixture() {
  const db = new Database(":memory:");
  runDbMigrations(db);
  const state = createInitialWikiCacheState();
  state.db = db;
  const deps: WikiQueryDependencies = {
    ensureIndexReady: async () => {}, drainPendingUpdates: async () => {},
    getDb: () => state.db!, getConfig: async () => DEFAULT_WIKI_OS_CONFIG,
    getCacheState: () => state, getPeriodicReconcileIntervalMs: () => null,
    getIndexDbPath: () => ":memory:", recordIntegrityCheck: () => {},
    formatError: (error, fallback) => error instanceof Error ? error.message : fallback,
  };
  function addPage(file: string, markdown = "alpha beta") {
    const slug = file.replace(/\.md$/, "");
    const title = slug.split("/").at(-1)!;
    upsertPageRecord(state.db!, {
      file, slug, title, titleLower: title.toLowerCase(), markdown,
      contentMarkdown: markdown, contentLower: markdown.toLowerCase(), wordCount: 2,
      backlinkReferences: [], categoryNames: [],
      explicitTopics: dedupeTopics(collectFrontmatterTopics(parseWikiFrontmatter(markdown).data, DEFAULT_WIKI_OS_CONFIG), {}),
      modifiedAt: 1, summary: markdown, isPerson: false,
    });
  }
  return { db, state, deps, addPage };
}
