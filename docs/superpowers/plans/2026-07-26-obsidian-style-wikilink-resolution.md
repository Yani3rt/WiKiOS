# Obsidian-Style Wikilink Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make basename-only wikilinks resolve to nested notes when safe, show an explicit chooser for duplicate filenames, and keep rendered links, Explorer, backlinks, connected notes, and graph edges consistent.

**Architecture:** Add one pure shared resolver that returns `resolved`, `ambiguous`, or `missing`. Resolve rendered hrefs at page-read time with source context, materialize canonical backlink targets after complete index reconciliation, and expose structured ambiguity results to the Wiki and Explorer clients.

**Tech Stack:** TypeScript 5, React 19, React Router 7, Fastify 5, better-sqlite3, Vitest, pnpm

## Global Constraints

- Prefer `pnpm`.
- Ask for confirmation before adding new production dependencies; this plan adds none.
- Follow the approved policy in `docs/plans/2026-07-26-obsidian-style-wikilink-resolution-design.md`.
- Explicit vault-relative paths always win and never fall back to basename matching.
- Unique basenames resolve vault-wide.
- A same-folder candidate wins when duplicate basenames exist.
- Remaining duplicates produce a chooser; WikiOS must not silently guess.
- Successful navigation uses the canonical full-path slug.
- Preserve the existing 404 experience for genuinely missing notes.
- Keep the existing untracked `output/` directory untouched.

---

## File Structure

### New files

- `src/lib/wiki-link-resolver.ts` — dependency-free target normalization, candidate index, result types, and deterministic resolution policy.
- `src/components/wikilink-ambiguity-view.tsx` — shared accessible duplicate-note chooser for Wiki and Explorer.
- `tests/wiki-link-resolver.test.ts` — pure resolver behavior.
- `tests/wiki-db-links.test.ts` — raw backlink persistence and canonical materialization.

### Modified files

- `src/lib/wiki-shared.ts` — shared ambiguity response types.
- `src/lib/markdown.ts` — optional href resolver during Markdown transformation.
- `src/lib/wiki-classification.ts` — preserve raw link targets without treating raw basenames as canonical slugs.
- `src/lib/wiki-db.ts` — cache schema version 6 and backlink resolution materialization.
- `src/lib/wiki-indexer.ts` — run backlink materialization once after full reconciliation.
- `src/lib/wiki-watcher.ts` — run backlink materialization once per changed watcher batch.
- `src/lib/wiki-state.ts` — update cache version when required by the schema bump.
- `src/lib/wiki-queries.ts` — route fallback, ambiguity error, and request-time canonical rendered hrefs.
- `src/lib/wiki.ts` — inject the resolver lifecycle and export the ambiguity guard.
- `src/server/app.ts` — return a structured HTTP 300 response for duplicate route matches.
- `src/client/api.ts` — parse page, ambiguity, setup, and missing responses without conflating them.
- `src/client/routes/wiki-route.tsx` — canonical redirects and direct-route ambiguity UI.
- `src/client/explorer-model.ts` — replace an unresolved tab with the chosen canonical tab.
- `src/client/routes/explorer-route.tsx` — represent and render an ambiguous reader state.
- `tests/wiki-utils.test.ts` — canonical and unresolved rendered href coverage.
- `tests/wiki-snapshot.test.ts` — nested resolution, backlinks, counts, graph edges, and duplicate topology changes.
- `tests/server-app.test.ts` — page API status and payload contracts.
- `tests/shared-note-viewer.test.ts` — preserve canonical internal-link interception.
- `tests/explorer-model.test.ts` — chooser rendering and canonical tab replacement.
- `tests/wiki-startup-heal.test.ts` — disposable cache rebuild after version 6.

---

### Task 1: Build the pure vault-aware resolver

**Files:**
- Create: `src/lib/wiki-link-resolver.ts`
- Create: `tests/wiki-link-resolver.test.ts`

**Interfaces:**
- Produces:
  - `WikiLinkCandidate`
  - `WikiLinkResolution`
  - `WikiLinkIndex`
  - `buildWikiLinkIndex(candidates)`
  - `resolveWikiLinkTarget(rawTarget, sourceFile, index)`
- Consumes: no filesystem, database, React, or server APIs.

- [ ] **Step 1: Write the failing resolver tests**

Create `tests/wiki-link-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildWikiLinkIndex,
  resolveWikiLinkTarget,
  type WikiLinkCandidate,
} from "../src/lib/wiki-link-resolver";

const candidates: WikiLinkCandidate[] = [
  { file: "00 Ideas/Ideas.md", slug: "00%20Ideas/Ideas", title: "Ideas" },
  { file: "Projects/Note.md", slug: "Projects/Note", title: "Note" },
  { file: "Archive/Note.md", slug: "Archive/Note", title: "Note" },
  { file: "Projects/Plan.md", slug: "Projects/Plan", title: "Plan" },
];

describe("wiki link resolver", () => {
  const index = buildWikiLinkIndex(candidates);

  it("resolves an explicit vault-relative path exactly", () => {
    expect(resolveWikiLinkTarget("Archive/Note", "Projects/Plan.md", index)).toEqual({
      status: "resolved",
      reason: "explicit",
      target: "Archive/Note",
      candidate: candidates[2],
    });
  });

  it("resolves a globally unique basename in a nested folder", () => {
    expect(resolveWikiLinkTarget("Ideas", "Home.md", index)).toEqual({
      status: "resolved",
      reason: "unique",
      target: "Ideas",
      candidate: candidates[0],
    });
  });

  it("prefers the same-folder candidate among duplicate basenames", () => {
    expect(resolveWikiLinkTarget("Note.md", "Projects/Plan.md", index)).toEqual({
      status: "resolved",
      reason: "same-folder",
      target: "Note",
      candidate: candidates[1],
    });
  });

  it("returns complete sorted candidates when duplicates remain", () => {
    expect(resolveWikiLinkTarget("Note", "Home.md", index)).toEqual({
      status: "ambiguous",
      target: "Note",
      candidates: [candidates[2], candidates[1]],
    });
  });

  it("does not basename-fallback an explicit missing path", () => {
    expect(resolveWikiLinkTarget("Missing/Note", "Home.md", index)).toEqual({
      status: "missing",
      target: "Missing/Note",
    });
  });

  it("normalizes separators and rejects parent traversal", () => {
    expect(resolveWikiLinkTarget("00 Ideas\\\\Ideas.md", "Home.md", index).status).toBe(
      "resolved",
    );
    expect(resolveWikiLinkTarget("../Ideas", "Home.md", index)).toEqual({
      status: "missing",
      target: "../Ideas",
    });
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run:

```bash
pnpm test -- tests/wiki-link-resolver.test.ts
```

Expected: FAIL because `src/lib/wiki-link-resolver.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver**

Create `src/lib/wiki-link-resolver.ts`:

```ts
export interface WikiLinkCandidate {
  file: string;
  slug: string;
  title: string;
}

export type WikiLinkResolution =
  | {
      status: "resolved";
      reason: "explicit" | "unique" | "same-folder";
      target: string;
      candidate: WikiLinkCandidate;
    }
  | {
      status: "ambiguous";
      target: string;
      candidates: WikiLinkCandidate[];
    }
  | {
      status: "missing";
      target: string;
    };

export interface WikiLinkIndex {
  candidates: readonly WikiLinkCandidate[];
  byPath: ReadonlyMap<string, readonly WikiLinkCandidate[]>;
  byBasename: ReadonlyMap<string, readonly WikiLinkCandidate[]>;
}

function normalizedPath(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function withoutMarkdownExtension(value: string) {
  return value.replace(/\.md$/iu, "");
}

function targetPath(rawTarget: string) {
  return withoutMarkdownExtension(normalizedPath(rawTarget));
}

function fileStem(file: string) {
  return withoutMarkdownExtension(normalizedPath(file));
}

function basename(value: string) {
  const parts = value.split("/");
  return parts[parts.length - 1] ?? value;
}

function dirname(value: string) {
  const parts = value.split("/");
  return parts.slice(0, -1).join("/");
}

function lookupKey(value: string) {
  return value.normalize("NFC").toLocaleLowerCase();
}

function sortedCandidates(values: readonly WikiLinkCandidate[]) {
  return [...values].sort(
    (left, right) =>
      left.file.localeCompare(right.file, undefined, { sensitivity: "base" }) ||
      left.file.localeCompare(right.file),
  );
}

function addToIndex(
  map: Map<string, WikiLinkCandidate[]>,
  key: string,
  candidate: WikiLinkCandidate,
) {
  const values = map.get(key);
  if (values) values.push(candidate);
  else map.set(key, [candidate]);
}

export function buildWikiLinkIndex(
  candidates: readonly WikiLinkCandidate[],
): WikiLinkIndex {
  const byPath = new Map<string, WikiLinkCandidate[]>();
  const byBasename = new Map<string, WikiLinkCandidate[]>();

  for (const candidate of candidates) {
    const stem = fileStem(candidate.file);
    addToIndex(byPath, lookupKey(stem), candidate);
    addToIndex(byBasename, lookupKey(basename(stem)), candidate);
  }

  return {
    candidates: sortedCandidates(candidates),
    byPath,
    byBasename,
  };
}

export function resolveWikiLinkTarget(
  rawTarget: string,
  sourceFile: string | null,
  index: WikiLinkIndex,
): WikiLinkResolution {
  const target = targetPath(rawTarget);
  const parts = target.split("/").filter(Boolean);

  if (
    !target ||
    parts.some((part) => part === "." || part === ".." || part.includes("\0"))
  ) {
    return { status: "missing", target };
  }

  if (target.includes("/")) {
    const exactCandidates = sortedCandidates(
      index.byPath.get(lookupKey(target)) ?? [],
    );
    if (exactCandidates.length === 1) {
      return {
        status: "resolved",
        reason: "explicit",
        target,
        candidate: exactCandidates[0],
      };
    }
    return exactCandidates.length > 1
      ? { status: "ambiguous", target, candidates: exactCandidates }
      : { status: "missing", target };
  }

  const basenameCandidates = sortedCandidates(
    index.byBasename.get(lookupKey(target)) ?? [],
  );
  if (basenameCandidates.length === 1) {
    return {
      status: "resolved",
      reason: "unique",
      target,
      candidate: basenameCandidates[0],
    };
  }

  if (sourceFile && basenameCandidates.length > 1) {
    const sourceFolder = dirname(fileStem(sourceFile));
    const sameFolder = basenameCandidates.filter(
      (candidate) => lookupKey(dirname(fileStem(candidate.file))) === lookupKey(sourceFolder),
    );
    if (sameFolder.length === 1) {
      return {
        status: "resolved",
        reason: "same-folder",
        target,
        candidate: sameFolder[0],
      };
    }
  }

  if (basenameCandidates.length > 1) {
    return { status: "ambiguous", target, candidates: basenameCandidates };
  }

  return { status: "missing", target };
}
```

- [ ] **Step 4: Run the resolver tests and verify GREEN**

Run:

```bash
pnpm test -- tests/wiki-link-resolver.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/wiki-link-resolver.ts tests/wiki-link-resolver.test.ts
git commit -m "feat: add vault-aware wikilink resolver"
```

---

### Task 2: Persist raw backlinks and materialize canonical targets

**Files:**
- Modify: `src/lib/wiki-classification.ts:475-493`
- Modify: `src/lib/wiki-db.ts:1-380`
- Modify: `src/lib/wiki-state.ts:1-30`
- Create: `tests/wiki-db-links.test.ts`
- Modify: `tests/wiki-startup-heal.test.ts`

**Interfaces:**
- Consumes:
  - `buildWikiLinkIndex()`
  - `resolveWikiLinkTarget()`
- Produces:
  - `reconcileBacklinkTargets(db: SqliteDb): void`
  - backlink rows keyed by `(source_file, target_raw)`
  - nullable `target_slug`
  - `resolution_state` with `resolved | ambiguous | missing`

- [ ] **Step 1: Write the failing database materialization tests**

Create `tests/wiki-db-links.test.ts`. Use an in-memory `better-sqlite3` database, call
`runDbMigrations`, insert pages through `upsertPageRecord`, then call
`reconcileBacklinkTargets`.

The assertions must cover:

```ts
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

expect(
  db.prepare(
    "SELECT target_slug, resolution_state FROM backlinks WHERE source_file = ?",
  ).get("Projects/Plan.md"),
).toEqual({
  target_slug: "Projects/Note",
  resolution_state: "resolved",
});

expect(
  db.prepare(
    "SELECT target_slug, resolution_state FROM backlinks WHERE source_file = ?",
  ).get("Home.md"),
).toEqual({
  target_slug: null,
  resolution_state: "ambiguous",
});

expect(
  db.prepare("SELECT backlink_count FROM pages WHERE slug = ?").get("Projects/Note"),
).toEqual({ backlink_count: 1 });
```

Use separate test cases for the unique-basename, same-folder, and ambiguous cases so each
failure identifies one policy rule.

- [ ] **Step 2: Run the database test and verify RED**

Run:

```bash
pnpm test -- tests/wiki-db-links.test.ts
```

Expected: FAIL because `reconcileBacklinkTargets` and the new schema columns do not exist.

- [ ] **Step 3: Change backlink extraction to preserve raw targets**

In `src/lib/wiki-classification.ts`, change `BacklinkReference` to:

```ts
export interface BacklinkReference {
  targetRaw: string;
}
```

Replace the push inside `extractBacklinkReferences` with:

```ts
references.push({ targetRaw: rawTarget });
```

Delete the now-unused `slugFromFileName` import from this module.

- [ ] **Step 4: Bump the disposable cache version**

Set both cache-version constants to `6`:

```ts
// src/lib/wiki-state.ts
export const CACHE_VERSION = 6;

// src/lib/wiki-db.ts
export const DEFAULT_WIKI_INDEX_CACHE_VERSION = 6;
```

Do not add an in-place `ALTER TABLE`: the existing startup self-heal must quarantine the
version-5 cache and build a fresh version-6 index.

Update the startup-heal regression to assert:

```ts
expect(userVersion).toBe(6);
```

and verify that a version-5 cache is rebuilt rather than opened as compatible.

- [ ] **Step 5: Replace the backlink table definition**

In `runDbMigrations`, define:

```sql
CREATE TABLE IF NOT EXISTS backlinks (
  source_file TEXT NOT NULL REFERENCES pages(file) ON DELETE CASCADE,
  target_raw TEXT NOT NULL,
  target_slug TEXT,
  resolution_state TEXT NOT NULL
    CHECK (resolution_state IN ('resolved', 'ambiguous', 'missing')),
  occurrence_count INTEGER NOT NULL,
  PRIMARY KEY (source_file, target_raw)
);
```

Keep `idx_backlinks_target_slug`.

- [ ] **Step 6: Aggregate and insert raw backlink references**

Change `aggregateBacklinkReferences` to key by `targetRaw`. In `upsertPageRecord`, insert
fresh rows as unresolved materialization input:

```ts
const insertBacklink = db.prepare(`
  INSERT INTO backlinks (
    source_file,
    target_raw,
    target_slug,
    resolution_state,
    occurrence_count
  )
  VALUES (?, ?, NULL, 'missing', ?)
`);

for (const target of backlinkTargets.values()) {
  insertBacklink.run(page.file, target.targetRaw, target.count);
}
```

Remove incremental count updates from `upsertPageRecord` and `deletePageByFile`; counts are
recomputed atomically by the new complete materialization pass.

- [ ] **Step 7: Implement canonical backlink materialization**

Add `reconcileBacklinkTargets` to `src/lib/wiki-db.ts`:

```ts
export function reconcileBacklinkTargets(db: SqliteDb) {
  const candidates = db
    .prepare("SELECT file, slug, title FROM pages")
    .all() as WikiLinkCandidate[];
  const references = db
    .prepare(`
      SELECT source_file AS sourceFile, target_raw AS targetRaw
      FROM backlinks
    `)
    .all() as Array<{ sourceFile: string; targetRaw: string }>;
  const index = buildWikiLinkIndex(candidates);
  const update = db.prepare(`
    UPDATE backlinks
    SET target_slug = ?, resolution_state = ?
    WHERE source_file = ? AND target_raw = ?
  `);

  const reconcile = db.transaction(() => {
    for (const reference of references) {
      const resolution = resolveWikiLinkTarget(
        reference.targetRaw,
        reference.sourceFile,
        index,
      );
      update.run(
        resolution.status === "resolved" ? resolution.candidate.slug : null,
        resolution.status,
        reference.sourceFile,
        reference.targetRaw,
      );
    }

    db.prepare("UPDATE pages SET backlink_count = 0").run();
    db.prepare(`
      UPDATE pages
      SET backlink_count = (
        SELECT COALESCE(SUM(backlinks.occurrence_count), 0)
        FROM backlinks
        WHERE backlinks.target_slug = pages.slug
          AND backlinks.resolution_state = 'resolved'
      )
    `).run();
  });

  reconcile();
}
```

Import `WikiLinkCandidate`, `buildWikiLinkIndex`, and `resolveWikiLinkTarget` from the pure
resolver module.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm test -- tests/wiki-db-links.test.ts tests/wiki-startup-heal.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run typecheck and fix only Task 2 fallout**

Run:

```bash
pnpm run typecheck
```

Expected: PASS after updating the indexer-facing backlink reference types from
`{ targetRaw, targetSlug }` to `{ targetRaw }`.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/lib/wiki-classification.ts src/lib/wiki-db.ts src/lib/wiki-state.ts tests/wiki-db-links.test.ts tests/wiki-startup-heal.test.ts
git commit -m "feat: materialize canonical backlink targets"
```

---

### Task 3: Re-resolve backlinks after complete index changes

**Files:**
- Modify: `src/lib/wiki-indexer.ts:50-120, 320-400`
- Modify: `src/lib/wiki-watcher.ts:45-65, 160-205`
- Modify: `src/lib/wiki.ts:15-25, 120-250`
- Modify: `tests/wiki-snapshot.test.ts`

**Interfaces:**
- Consumes:
  - `reconcileBacklinkTargets(db)`
- Produces:
  - full reconciliation resolves links once after all file inserts/deletes;
  - watcher flush resolves links once after the complete changed-path batch and before
    `markRevisionChanged()`.

- [ ] **Step 1: Write the failing topology-change regression**

In `tests/wiki-snapshot.test.ts`, create:

```text
Home.md              -> [[Note]]
Projects/Note.md
```

Assert the first reindex gives `Projects/Note` one backlink and a graph edge from `Home`.
Then create `Archive/Note.md`, call `reindexWikiSnapshot()`, and assert:

```ts
expect(home.neighbors).toEqual([]);
expect(graph.edges).not.toContainEqual(
  expect.objectContaining({ source: "Home", target: "Projects/Note" }),
);
expect(projectsNote.backlinkCount).toBe(0);
```

Remove `Archive/Note.md`, reindex, and assert the canonical relationship returns.

- [ ] **Step 2: Run the topology test and verify RED**

Run:

```bash
pnpm test -- tests/wiki-snapshot.test.ts
```

Expected: FAIL because backlink materialization is not yet wired into reconciliation.

- [ ] **Step 3: Add the database lifecycle dependency**

Extend `WikiIndexerDbDependencies<TDb>` with:

```ts
reconcileBacklinkTargets: (db: TDb) => void;
```

At the end of `reconcileIndexWithDisk`, after all upserts and deletes and before revision
notification, call:

```ts
deps.reconcileBacklinkTargets(db);
```

The call must run even when the current process did not detect an mtime change, because a
fresh schema rebuild and a previously interrupted materialization both need a complete,
deterministic result.

- [ ] **Step 4: Resolve once per watcher batch**

Add this dependency to `WikiWatcherDependencies`:

```ts
reconcileBacklinkTargets: () => void;
```

Inside `flushPendingWatcherChanges`, after processing every pending path and before
`markRevisionChanged`, add:

```ts
if (changed && !needsFullReconcile) {
  dependencies.reconcileBacklinkTargets();
}
```

Do not call it again when `needsFullReconcile` is true; the indexer's full reconcile already
performed the materialization.

- [ ] **Step 5: Inject the lifecycle from `wiki.ts`**

Import the database function with a non-conflicting local name:

```ts
import {
  reconcileBacklinkTargets as reconcileDbBacklinkTargets,
} from "./wiki-db";
```

Pass it to the indexer:

```ts
reconcileBacklinkTargets: (db) => reconcileDbBacklinkTargets(db),
```

Pass it to the watcher controller:

```ts
reconcileBacklinkTargets: () => reconcileDbBacklinkTargets(requireDb()),
```

- [ ] **Step 6: Run focused index tests**

Run:

```bash
pnpm test -- tests/wiki-db-links.test.ts tests/wiki-snapshot.test.ts tests/wiki-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/wiki-indexer.ts src/lib/wiki-watcher.ts src/lib/wiki.ts tests/wiki-snapshot.test.ts
git commit -m "feat: refresh wikilinks after vault changes"
```

---

### Task 4: Canonicalize rendered links and expose route ambiguity

**Files:**
- Modify: `src/lib/wiki-shared.ts:1-55`
- Modify: `src/lib/markdown.ts:1-15, 145-165`
- Modify: `src/lib/wiki-queries.ts:90-115, 535-620`
- Modify: `src/lib/wiki.ts:50-80, 400-415`
- Modify: `src/server/app.ts:15-35, 410-425`
- Modify: `tests/wiki-utils.test.ts`
- Modify: `tests/server-app.test.ts`

**Interfaces:**
- Produces:
  - `WikiLinkAmbiguityData`
  - `WikiLinkAmbiguityError`
  - `isWikiLinkAmbiguityError(error)`
  - HTTP 300 JSON `{ code: "AMBIGUOUS_WIKILINK", target, candidates }`
- Consumes:
  - shared pure resolver;
  - materialized complete page list.

- [ ] **Step 1: Write failing Markdown and server contract tests**

Add a `wiki-utils` test proving an injected href resolver is used:

```ts
expect(
  transformObsidianLinks("See [[Ideas]].", () => "/wiki/00%20Ideas/Ideas"),
).toBe("See [Ideas](/wiki/00%20Ideas/Ideas).");
```

Add server fixtures:

```text
Home.md                 -> [[Ideas]] and [[Note]]
00 Ideas/Ideas.md
Projects/Note.md
Archive/Note.md
```

Assert:

```ts
expect(uniqueNested.statusCode).toBe(200);
expect(uniqueNested.json().slug).toBe("00%20Ideas/Ideas");
expect(home.json().contentMarkdown).toContain(
  "[Ideas](/wiki/00%20Ideas/Ideas)",
);

expect(ambiguous.statusCode).toBe(300);
expect(ambiguous.json()).toEqual({
  code: "AMBIGUOUS_WIKILINK",
  target: "Note",
  candidates: [
    { file: "Archive/Note.md", slug: "Archive/Note", title: "Note" },
    { file: "Projects/Note.md", slug: "Projects/Note", title: "Note" },
  ],
});

expect(missing.statusCode).toBe(404);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test -- tests/wiki-utils.test.ts tests/server-app.test.ts
```

Expected: FAIL because route fallback and ambiguity contracts do not exist.

- [ ] **Step 3: Add shared ambiguity data**

In `src/lib/wiki-shared.ts`:

```ts
import type { WikiLinkCandidate } from "./wiki-link-resolver";

export interface WikiLinkAmbiguityData {
  code: "AMBIGUOUS_WIKILINK";
  target: string;
  candidates: WikiLinkCandidate[];
}
```

- [ ] **Step 4: Make Markdown link transformation injectable**

Change `src/lib/markdown.ts`:

```ts
export type WikiLinkHrefResolver = (target: string) => string;

export function transformObsidianLinks(
  markdown: string,
  resolveHref: WikiLinkHrefResolver = wikilinkHref,
) {
  return markdown.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, rawTarget: string, rawLabel?: string) => {
      const target = rawTarget.trim();
      const label = (rawLabel ?? rawTarget).trim();
      return `[${label}](${resolveHref(target)})`;
    },
  );
}

export function prepareWikiMarkdown(
  markdown: string,
  resolveHref?: WikiLinkHrefResolver,
): PreparedWikiMarkdown {
  const { body } = parseWikiFrontmatter(markdown);
  const contentMarkdown = stripLeadingMarkdownTitle(
    transformObsidianLinks(body, resolveHref),
  );
  return {
    contentMarkdown,
    hasCodeBlocks: contentMarkdown.includes("```"),
    headings: extractMarkdownHeadings(contentMarkdown),
  };
}
```

- [ ] **Step 5: Add a typed ambiguity error and route fallback**

In `src/lib/wiki-queries.ts`, define:

```ts
export class WikiLinkAmbiguityError extends Error {
  readonly data: WikiLinkAmbiguityData;

  constructor(target: string, candidates: WikiLinkCandidate[]) {
    super(`Multiple notes match "${target}"`);
    this.name = "WikiLinkAmbiguityError";
    this.data = {
      code: "AMBIGUOUS_WIKILINK",
      target,
      candidates,
    };
  }
}
```

Create a helper that reads `file`, `slug`, and `title` from `pages`, builds the resolver index,
and resolves the requested route only after exact canonical lookup fails. Pass `null` as the
source file for direct routes.

In `getWikiPage`:

1. canonicalize and attempt `WHERE slug = ?`;
2. if missing, resolve the decoded requested target against the page index;
3. use the resolved candidate's slug for a second exact lookup;
4. throw `WikiLinkAmbiguityError` for duplicates;
5. preserve `Wiki page not found` for missing targets.

- [ ] **Step 6: Canonicalize hrefs when returning page Markdown**

Select the stored raw `markdown` column with the page row. Before returning `WikiPageData`,
prepare it using the source row and complete resolver index:

```ts
const prepared = prepareWikiMarkdown(row.markdown, (target) => {
  const resolution = resolveWikiLinkTarget(target, row.file, linkIndex);
  return resolution.status === "resolved"
    ? `/wiki/${resolution.candidate.slug}`
    : wikilinkHref(target);
});
```

Return `prepared.contentMarkdown`, `prepared.hasCodeBlocks`, and `prepared.headings`. Do not
rewrite files in the vault.

- [ ] **Step 7: Export the ambiguity guard**

From `src/lib/wiki.ts`:

```ts
export function isWikiLinkAmbiguityError(
  error: unknown,
): error is WikiLinkAmbiguityError {
  return error instanceof WikiLinkAmbiguityError;
}
```

- [ ] **Step 8: Return structured HTTP 300 from the Wiki API**

In the `/api/wiki/*` catch block:

```ts
if (isWikiLinkAmbiguityError(error)) {
  return reply.code(300).send(error.data);
}
```

Keep setup-required and 404 handling unchanged.

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm test -- tests/wiki-utils.test.ts tests/server-app.test.ts tests/wiki-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit Task 4**

```bash
git add src/lib/wiki-shared.ts src/lib/markdown.ts src/lib/wiki-queries.ts src/lib/wiki.ts src/server/app.ts tests/wiki-utils.test.ts tests/server-app.test.ts
git commit -m "feat: resolve nested wikilinks in page routes"
```

---

### Task 5: Add the shared ambiguity chooser to direct Wiki pages

**Files:**
- Create: `src/components/wikilink-ambiguity-view.tsx`
- Modify: `src/client/api.ts:1-40`
- Modify: `src/client/routes/wiki-route.tsx:1-155`
- Modify: `tests/shared-note-viewer.test.ts`

**Interfaces:**
- Produces:
  - `WikiPageLoadResult`
  - `fetchWikiPage(input, init?)`
  - `WikilinkAmbiguityView`
- Consumes:
  - HTTP 200 `WikiPageData`
  - HTTP 300 `WikiLinkAmbiguityData`

- [ ] **Step 1: Write failing API-parser and chooser tests**

In `tests/shared-note-viewer.test.ts`, add tests for:

```ts
const data: WikiLinkAmbiguityData = {
  code: "AMBIGUOUS_WIKILINK",
  target: "Note",
  candidates: [
    { file: "Archive/Note.md", slug: "Archive/Note", title: "Note" },
    { file: "Projects/Note.md", slug: "Projects/Note", title: "Note" },
  ],
};
```

Server-render `WikilinkAmbiguityView` and assert the markup contains:

```text
Which note did you mean?
Archive/Note.md
Projects/Note.md
Browse notes
```

Assert both candidate controls are buttons. Inspect the component source to assert each
candidate button calls `onSelect(candidate)`; do not add a DOM-testing dependency.

- [ ] **Step 2: Run the focused client test and verify RED**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts
```

Expected: FAIL because the chooser does not exist.

- [ ] **Step 3: Add a page-specific fetch helper**

In `src/client/api.ts`, factor the existing JSON body parsing into a private helper, then add:

```ts
export type WikiPageLoadResult =
  | { status: "ready"; page: WikiPageData }
  | { status: "ambiguous"; ambiguity: WikiLinkAmbiguityData };

export async function fetchWikiPage(
  input: string,
  init?: RequestInit,
): Promise<WikiPageLoadResult> {
  const response = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });
  const payload = await readResponsePayload(response);

  if (response.status === 300) {
    return {
      status: "ambiguous",
      ambiguity: payload as WikiLinkAmbiguityData,
    };
  }
  if (!response.ok) {
    throw responseFromFailedPayload(response, payload);
  }
  return { status: "ready", page: payload as WikiPageData };
}
```

Keep `fetchJson` and `isSetupRequiredResponse` behavior compatible with existing callers.

- [ ] **Step 4: Build the accessible shared chooser**

Create `src/components/wikilink-ambiguity-view.tsx`:

```tsx
import type { WikiLinkCandidate } from "@/lib/wiki-link-resolver";

export function WikilinkAmbiguityView({
  target,
  candidates,
  onSelect,
  onBrowseNotes,
}: {
  target: string;
  candidates: WikiLinkCandidate[];
  onSelect: (candidate: WikiLinkCandidate) => void;
  onBrowseNotes: () => void;
}) {
  return (
    <section
      aria-labelledby="wikilink-ambiguity-title"
      className="mx-auto w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <h1 id="wikilink-ambiguity-title" className="text-2xl font-semibold">
        Which note did you mean?
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Multiple notes share the name “{target}”. Choose a folder to continue.
      </p>
      <ul className="mt-5 space-y-2">
        {candidates.map((candidate) => (
          <li key={candidate.file}>
            <button
              type="button"
              className="min-h-11 w-full rounded-lg border border-[var(--border)] px-4 py-3 text-left"
              onClick={() => onSelect(candidate)}
            >
              <span className="block font-medium">{candidate.title}</span>
              <span className="block text-sm text-[var(--muted-foreground)]">
                {candidate.file}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-5 min-h-11 px-4 py-2 text-sm font-medium"
        onClick={onBrowseNotes}
      >
        Browse notes
      </button>
    </section>
  );
}
```

Use existing design tokens; do not add a new component library.

- [ ] **Step 5: Integrate direct Wiki loading**

Change the Wiki loader to call `fetchWikiPage`.

For a ready result whose `page.slug` differs from the requested slug, throw:

```ts
throw redirect(`/wiki/${result.page.slug}`);
```

Return the ambiguity result without redirecting. In the route component:

```tsx
if (result.status === "ambiguous") {
  return (
    <WikilinkAmbiguityView
      target={result.ambiguity.target}
      candidates={result.ambiguity.candidates}
      onSelect={(candidate) => navigate(`/wiki/${candidate.slug}`, { replace: true })}
      onBrowseNotes={() => navigate("/explorer")}
    />
  );
}
```

Render the existing `NoteViewer` for `ready`.

- [ ] **Step 6: Run focused client tests**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts tests/wiki-utils.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/components/wikilink-ambiguity-view.tsx src/client/api.ts src/client/routes/wiki-route.tsx tests/shared-note-viewer.test.ts
git commit -m "feat: show duplicate-note wikilink chooser"
```

---

### Task 6: Integrate ambiguity and canonical tab replacement in Explorer

**Files:**
- Modify: `src/client/explorer-model.ts`
- Modify: `src/client/routes/explorer-route.tsx:45-85, 190-210, 680-810, 860-1030`
- Modify: `tests/explorer-model.test.ts`

**Interfaces:**
- Consumes:
  - `WikiPageLoadResult`
  - `WikilinkAmbiguityView`
  - `WikiLinkCandidate`
- Produces:
  - `replaceExplorerTabWithCandidate(workspace, unresolvedSlug, candidate)`
  - Explorer reader state `{ status: "ambiguous"; slug; ambiguity }`

- [ ] **Step 1: Write failing Explorer model tests**

Add a test:

```ts
expect(
  replaceExplorerTabWithCandidate(
    {
      tabs: [
        { slug: "Home", file: "Home.md", title: "Home" },
        { slug: "Note", file: "Note.md", title: "Note" },
      ],
      activeSlug: "Note",
    },
    "Note",
    {
      file: "Projects/Note.md",
      slug: "Projects/Note",
      title: "Note",
    },
  ),
).toEqual({
  tabs: [
    { slug: "Home", file: "Home.md", title: "Home" },
    { slug: "Projects/Note", file: "Projects/Note.md", title: "Note" },
  ],
  activeSlug: "Projects/Note",
});
```

Also cover deduplication when the canonical candidate is already open: remove the unresolved
tab and activate the existing canonical tab.

Add source assertions or rendered markup assertions proving `ExplorerReader` renders
`WikilinkAmbiguityView` for an ambiguous state instead of `ExplorerRecoveryState`.

- [ ] **Step 2: Run the Explorer tests and verify RED**

Run:

```bash
pnpm test -- tests/explorer-model.test.ts
```

Expected: FAIL because the replacement helper and state do not exist.

- [ ] **Step 3: Implement canonical tab replacement**

In `src/client/explorer-model.ts`:

```ts
export function replaceExplorerTabWithCandidate(
  workspace: ExplorerWorkspace,
  unresolvedSlug: string,
  candidate: WikiLinkCandidate,
): ExplorerWorkspace {
  const canonicalTab: ExplorerTab = {
    slug: candidate.file.replace(/\.md$/iu, ""),
    file: candidate.file,
    title: candidate.title,
  };
  const existingCanonical = workspace.tabs.find(
    (tab) => tab.slug === canonicalTab.slug && tab.slug !== unresolvedSlug,
  );

  if (existingCanonical) {
    return {
      tabs: workspace.tabs.filter((tab) => tab.slug !== unresolvedSlug),
      activeSlug: existingCanonical.slug,
    };
  }

  return {
    tabs: workspace.tabs.map((tab) =>
      tab.slug === unresolvedSlug ? canonicalTab : tab,
    ),
    activeSlug:
      workspace.activeSlug === unresolvedSlug
        ? canonicalTab.slug
        : workspace.activeSlug,
  };
}
```

Import the type from the shared resolver module.

- [ ] **Step 4: Extend Explorer reader state**

Add:

```ts
| {
    slug: string;
    status: "ambiguous";
    ambiguity: WikiLinkAmbiguityData;
  }
```

Change `loadPage` to call `fetchWikiPage`. Map `ready` to the current ready state and map the
HTTP 300 result to the new ambiguity state.

Do not classify HTTP 300 as setup required; setup remains HTTP 409.

- [ ] **Step 5: Render and resolve the chooser inside Explorer**

Extend `ExplorerReader` props with:

```ts
onResolveAmbiguity: (
  unresolvedSlug: string,
  candidate: WikiLinkCandidate,
) => void;
```

Before the missing/error branch:

```tsx
if (state.status === "ambiguous") {
  return (
    <div className="p-4 sm:p-8">
      <WikilinkAmbiguityView
        target={state.ambiguity.target}
        candidates={state.ambiguity.candidates}
        onSelect={(candidate) => onResolveAmbiguity(state.slug, candidate)}
        onBrowseNotes={onBrowseNotes}
      />
    </div>
  );
}
```

In the Explorer component, implement the callback by applying
`replaceExplorerTabWithCandidate`, setting the new workspace, and navigating with
`explorerPath(next.activeSlug)`. Use `{ replace: true }` so the unresolved basename route does
not remain in browser history.

- [ ] **Step 6: Canonicalize a ready short-link tab**

If `loadPage("Ideas")` returns a page with file `00 Ideas/Ideas.md`, replace the unresolved
tab with that canonical candidate before setting the ready reader state. This covers stale
or externally entered Explorer short URLs without showing a duplicate tab.

- [ ] **Step 7: Run focused Explorer tests**

Run:

```bash
pnpm test -- tests/explorer-model.test.ts tests/shared-note-viewer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 6**

```bash
git add src/client/explorer-model.ts src/client/routes/explorer-route.tsx tests/explorer-model.test.ts
git commit -m "feat: resolve ambiguous wikilinks in explorer"
```

---

### Task 7: Complete cross-stack regression coverage and verification

**Files:**
- Modify: `tests/wiki-snapshot.test.ts`
- Modify: `tests/server-app.test.ts`
- Modify: `tests/shared-note-viewer.test.ts`
- Modify: `tests/explorer-model.test.ts`
- Modify: `tests/wiki-startup-heal.test.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete approved design without creating new runtime interfaces.

- [ ] **Step 1: Add the final cross-stack matrix**

Ensure the focused suites contain all of these named cases:

```text
resolver: unique nested basename
resolver: explicit full path
resolver: same-folder duplicate
resolver: ambiguous duplicate
resolver: missing target
index: unique nested backlink and count
index: ambiguous backlink omitted from graph
index: duplicate add/remove re-resolution
api: unique basename returns canonical page
api: duplicate basename returns HTTP 300 candidates
api: missing basename returns 404
markdown: resolved href is canonical
wiki route: canonical redirect
wiki route: accessible ambiguity chooser
explorer: canonical tab replacement
explorer: ambiguity chooser selection
cache: version-5 index rebuilds as version 6
```

- [ ] **Step 2: Document wikilink behavior**

In the README route/content section, add:

```md
### Wikilink resolution

WikiOS resolves `[[Note]]` across the complete vault when the filename is unique.
`[[Folder/Note]]` always resolves from the vault root. If duplicate filenames exist,
a note in the source note's folder is preferred; otherwise WikiOS asks which complete
path to open instead of guessing.
```

- [ ] **Step 3: Run all tests**

Run:

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run lint**

Run:

```bash
pnpm run lint
```

Expected: PASS.

- [ ] **Step 6: Run production build**

Run:

```bash
pnpm run build
```

Expected: client, server, and config builds complete successfully.

- [ ] **Step 7: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` prints nothing.
- Only intended implementation/test/documentation files are modified.
- The pre-existing untracked `output/` directory remains unmodified and unstaged.

- [ ] **Step 8: Commit verification and documentation**

```bash
git add README.md tests/wiki-snapshot.test.ts tests/server-app.test.ts tests/shared-note-viewer.test.ts tests/explorer-model.test.ts tests/wiki-startup-heal.test.ts
git commit -m "test: verify obsidian-style wikilinks"
```

---

## Self-Review

### Spec coverage

- Unique basename lookup: Tasks 1, 4, and 7.
- Explicit path precedence: Tasks 1, 4, and 7.
- Same-folder duplicate preference: Tasks 1, 2, 3, and 7.
- No silent duplicate guessing: Tasks 1, 4, 5, 6, and 7.
- Canonical full-path navigation: Tasks 4, 5, 6, and 7.
- Rendered Markdown consistency: Task 4.
- Backlinks, counts, connected notes, and graph consistency: Tasks 2, 3, and 7.
- Direct Wiki ambiguity UI: Task 5.
- Explorer ambiguity UI and tab replacement: Task 6.
- Missing-note behavior: Tasks 4, 5, 6, and 7.
- Cache rebuild: Tasks 2 and 7.
- No dependencies: every task uses existing TypeScript, React, Fastify, SQLite, and Vitest.

### Placeholder scan

The plan contains no deferred implementation markers. Each task names its files, interfaces,
test command, expected failure or success, implementation seam, and commit.

### Type consistency

- `WikiLinkCandidate` is defined once in `wiki-link-resolver.ts`.
- `WikiLinkAmbiguityData` contains the same candidate type used by the server, Wiki route,
  Explorer, and chooser.
- `WikiPageLoadResult` is the only client union for HTTP 200 and HTTP 300 page loads.
- `target_slug` is canonical only when `resolution_state = 'resolved'`.
- Explorer replacement consumes `WikiLinkCandidate` and produces the existing
  `ExplorerWorkspace`.
