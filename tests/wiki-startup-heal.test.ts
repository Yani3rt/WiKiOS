import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";

import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runDbMigrations } from "../src/lib/wiki-db";

const cacheKey = "__wikiUiCache";

async function loadWikiModule(root: string, dbPath: string) {
  process.env.WIKI_ROOT = root;
  process.env.WIKIOS_FORCE_WIKI_ROOT = root;
  process.env.WIKIOS_INDEX_DB = dbPath;
  vi.resetModules();
  delete (globalThis as typeof globalThis & { __wikiUiCache?: unknown })[cacheKey];

  const { configureServerWikiCore } = await import("../src/server/wiki-core-adapter");
  configureServerWikiCore();
  return import("../src/lib/wiki");
}

afterEach(() => {
  delete process.env.WIKI_ROOT;
  delete process.env.WIKIOS_FORCE_WIKI_ROOT;
  delete process.env.WIKIOS_INDEX_DB;
  vi.resetModules();
  delete (globalThis as typeof globalThis & { __wikiUiCache?: unknown })[cacheKey];
});

describe("wiki startup self-heal", () => {
  it("rebuilds from the vault when the existing index file is corrupt", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-self-heal-"));
    const wikiRoot = path.join(tempDir, "vault");
    const indexDbPath = path.join(tempDir, "index.sqlite");

    try {
      await mkdir(wikiRoot, { recursive: true });
      await writeFile(path.join(wikiRoot, "Alpha.md"), "# Alpha\n\nRecovered from vault.\n");
      await writeFile(indexDbPath, "not-a-valid-sqlite-file");

      const wiki = await loadWikiModule(wikiRoot, indexDbPath);
      const homepage = await wiki.getHomepageData();
      const page = await wiki.getWikiPage(["Alpha"]);
      const health = await wiki.getWikiHealthStatus();
      const tempFiles = await readdir(tempDir);

      expect(homepage.totalPages).toBe(1);
      expect(page.fileName).toBe("Alpha.md");
      expect(health.integrity.ok).toBe(true);
      expect(
        tempFiles.some((fileName) => fileName.startsWith("index.sqlite.corrupt-")),
      ).toBe(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any)[cacheKey]?.db?.close();
      const rebuiltDb = new Database(indexDbPath, { readonly: true });
      const userVersion = rebuiltDb.pragma("user_version", { simple: true });
      rebuiltDb.close();

      expect(userVersion).toBe(6);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("cache: version-5 index rebuilds as version 6", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-self-heal-"));
    const wikiRoot = path.join(tempDir, "vault");
    const indexDbPath = path.join(tempDir, "index.sqlite");

    try {
      await mkdir(wikiRoot, { recursive: true });
      await writeFile(path.join(wikiRoot, "Alpha.md"), "# Alpha\n");
      const staleDb = new Database(indexDbPath);
      runDbMigrations(staleDb, { cacheVersion: 5 });
      staleDb.close();

      const wiki = await loadWikiModule(wikiRoot, indexDbPath);
      const homepage = await wiki.getHomepageData();
      const tempFiles = await readdir(tempDir);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any)[cacheKey]?.db?.close();
      const rebuiltDb = new Database(indexDbPath, { readonly: true });
      const userVersion = rebuiltDb.pragma("user_version", { simple: true });
      rebuiltDb.close();

      expect(homepage.totalPages).toBe(1);
      expect(userVersion).toBe(6);
      expect(
        tempFiles.some((fileName) => fileName.startsWith("index.sqlite.corrupt-")),
      ).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
