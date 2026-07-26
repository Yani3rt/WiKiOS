import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  reconcileBacklinkTargets,
  runDbMigrations,
  upsertPageRecord,
  type IndexedWikiPageRecord,
  type SqliteDb,
} from "../src/lib/wiki-db";

function createPage(
  file: string,
  backlinkReferences: IndexedWikiPageRecord["backlinkReferences"] = [],
): IndexedWikiPageRecord {
  const title = file.replace(/\.md$/, "").split("/").at(-1) ?? file;

  return {
    file,
    slug: file.replace(/\.md$/, "").replaceAll(" ", "%20"),
    title,
    titleLower: title.toLowerCase(),
    markdown: "",
    contentMarkdown: "",
    contentLower: "",
    wordCount: 0,
    backlinkReferences,
    categoryNames: [],
    hasCodeBlocks: false,
    headings: [],
    modifiedAt: 0,
    summary: "",
    isPerson: false,
  };
}

function createDb() {
  const db = new Database(":memory:");
  runDbMigrations(db);
  return db;
}

describe("reconcileBacklinkTargets", () => {
  const databases: SqliteDb[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) {
      db.close();
    }
  });

  it("materializes a unique basename target", () => {
    const db = createDb();
    databases.push(db);
    upsertPageRecord(db, createPage("00 Ideas/Ideas.md"));
    upsertPageRecord(db, createPage("Home.md", [{ targetRaw: "Ideas" }]));

    reconcileBacklinkTargets(db);

    expect(
      db.prepare(
        "SELECT target_raw, target_slug, resolution_state FROM backlinks WHERE source_file = ?",
      ).all("Home.md"),
    ).toEqual([
      {
        target_raw: "Ideas",
        target_slug: "00%20Ideas/Ideas",
        resolution_state: "resolved",
      },
    ]);
  });

  it("materializes an ambiguous basename to the source folder", () => {
    const db = createDb();
    databases.push(db);
    upsertPageRecord(db, createPage("Archive/Note.md"));
    upsertPageRecord(db, createPage("Projects/Note.md"));
    upsertPageRecord(db, createPage("Projects/Plan.md", [{ targetRaw: "Note" }]));

    reconcileBacklinkTargets(db);

    expect(
      db.prepare(
        "SELECT target_slug, resolution_state FROM backlinks WHERE source_file = ?",
      ).get("Projects/Plan.md"),
    ).toEqual({
      target_slug: "Projects/Note",
      resolution_state: "resolved",
    });

    expect(
      db.prepare("SELECT backlink_count FROM pages WHERE slug = ?").get("Projects/Note"),
    ).toEqual({ backlink_count: 1 });
  });

  it("keeps an ambiguous basename unresolved", () => {
    const db = createDb();
    databases.push(db);
    upsertPageRecord(db, createPage("Archive/Note.md"));
    upsertPageRecord(db, createPage("Projects/Note.md"));
    upsertPageRecord(db, createPage("Home.md", [{ targetRaw: "Note" }]));

    reconcileBacklinkTargets(db);

    expect(
      db.prepare(
        "SELECT target_slug, resolution_state FROM backlinks WHERE source_file = ?",
      ).get("Home.md"),
    ).toEqual({
      target_slug: null,
      resolution_state: "ambiguous",
    });
  });
});
