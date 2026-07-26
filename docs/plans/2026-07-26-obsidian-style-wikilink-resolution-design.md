# Obsidian-Style Wikilink Resolution Design

**Date:** 2026-07-26  
**Status:** Approved

## Problem

WikiOS currently converts a wikilink target directly into a route slug. For example,
`[[Ideas]]` becomes `/wiki/Ideas`. Notes are indexed by their complete vault-relative
path, so a file such as `00 Ideas/Ideas.md` has the slug `00%20Ideas/Ideas`. The page
query performs an exact slug lookup and therefore cannot find the nested note from the
basename-only link.

The same raw-slug assumption is used by rendered links and backlink records. A viewer-only
fallback would leave Explorer navigation, connected notes, backlink counts, and graph edges
inconsistent.

## Goals

- Resolve basename-only wikilinks anywhere in the vault when the filename is unique.
- Preserve explicit vault-relative paths such as `[[Projects/Note]]`.
- Prefer a same-folder match when duplicate filenames exist.
- Never silently guess between remaining duplicate candidates.
- Show an accessible ambiguity chooser with complete folder paths.
- Canonicalize successful navigation to the selected note's complete slug.
- Apply one resolution policy to the Wiki route, Explorer, rendered Markdown, backlinks,
  backlink counts, connected notes, and graph edges.
- Keep the implementation dependency-free.

## Non-goals

- Editing Markdown files to replace short links with full paths.
- Remembering a user's ambiguity choice or mutating the source note.
- Adding aliases, heading links, block references, embeds, or Markdown-link resolution.
- Fuzzy matching misspelled filenames.
- Reproducing undocumented Obsidian tie-breaking behavior that can silently select a file.

## Resolution Policy

The resolver accepts a raw wikilink target, an optional source file, and the current set of
indexed Markdown files. It returns one of three states: `resolved`, `ambiguous`, or `missing`.

Resolution is performed in this order:

1. Normalize separators, whitespace, and an optional `.md` suffix.
2. If the target contains a folder path, require an exact vault-relative path match.
3. For a basename-only target, collect every note with the same filename.
4. If exactly one candidate exists, resolve it.
5. If a source file is available and exactly one candidate is in the source file's folder,
   resolve the same-folder candidate.
6. If multiple candidates remain, return `ambiguous` with candidates sorted by complete
   path.
7. If no candidate exists, return `missing`.

Successful results always contain the candidate's canonical indexed slug. File paths are
preserved for display, while normalized lookup keys are used only for comparison.

### Examples

| Source | Link | Vault candidates | Result |
| --- | --- | --- | --- |
| `Home.md` | `[[Ideas]]` | `00 Ideas/Ideas.md` | Resolve `00 Ideas/Ideas.md` |
| `Home.md` | `[[Projects/Note]]` | `Projects/Note.md`, `Archive/Note.md` | Resolve `Projects/Note.md` |
| `Projects/Plan.md` | `[[Note]]` | `Projects/Note.md`, `Archive/Note.md` | Resolve `Projects/Note.md` |
| `Home.md` | `[[Note]]` | `Projects/Note.md`, `Archive/Note.md` | Ambiguous |
| `Home.md` | `[[Missing]]` | none | Missing |

## Architecture

### Shared pure resolver

A new dependency-free module owns normalization, candidate indexing, and the resolution
policy. Both server and client code use the same result types and ordering rules. The
resolver does not read the filesystem or database.

### Rendered Markdown

Raw note Markdown remains the source of truth in the index. When a page is loaded, the
server transforms its wikilinks using the complete page index and the page's source file:

- resolved targets receive canonical `/wiki/<full-slug>` hrefs;
- ambiguous targets retain a basename route that produces the chooser;
- missing targets retain their route and continue to produce the existing not-found state.

This avoids depending on filesystem traversal order during initial indexing.

### Materialized backlink resolution

Backlink rows retain the raw target and store a nullable resolved target slug plus a
resolution state. After a full reconciliation, or once after a watcher batch changes one or
more notes, WikiOS resolves all raw backlink targets against the complete page set and
recomputes backlink counts.

Resolved rows continue to power the existing SQL joins for connected notes and graph edges.
Ambiguous and missing rows have no resolved slug, so they do not create a false relationship
to an arbitrary note.

Because the SQLite database is a disposable index, the cache schema version is incremented.
Existing indexes self-heal through the established quarantine-and-rebuild path.

### Wiki route lookup

The Wiki API first attempts a canonical exact-slug lookup. If that fails, it applies the
basename resolver without source context:

- a unique basename returns the canonical page;
- duplicates return a structured multiple-choice response;
- no match returns 404.

The direct Wiki loader replaces a successful short URL with the canonical full-path URL.
An ambiguous result renders the shared chooser.

### Explorer lookup

Explorer normally receives canonical hrefs from rendered Markdown. If an ambiguous basename
is selected, the page request returns the same structured candidate list used by the Wiki
route. Choosing a candidate replaces the unresolved Explorer tab with the canonical note
instead of leaving a broken or duplicate tab behind.

## Ambiguity Experience

The existing “note is not available” state is reserved for genuinely missing notes. Duplicate
matches render a distinct state:

- heading: **Which note did you mean?**
- explanation: multiple notes share this name;
- one keyboard-accessible button per candidate;
- each choice shows the note title and complete vault-relative folder path;
- a secondary action returns to browsing notes.

Candidate ordering is deterministic by case-insensitive full path, followed by exact path.
Selecting a candidate navigates to its canonical full slug.

## Error Handling

- Explicit paths never fall back to basename matching.
- Missing links preserve the existing 404 and retry/browse recovery behavior.
- Ambiguity is a normal lookup result, not a server error or setup-required condition.
- Malformed or unsafe route segments continue to be rejected.
- Ambiguous and missing backlinks do not contribute graph edges or backlink counts.
- Adding, removing, or moving a duplicate note triggers backlink re-resolution before the
  index revision becomes visible to queries.

## Testing Strategy

### Pure resolver tests

- explicit-path exact match;
- unique basename in a nested folder;
- same-folder preference;
- deterministic ambiguous candidates;
- missing target;
- optional `.md` suffix and separator normalization;
- canonical slug preservation.

### Index and query tests

- basename backlinks resolve to nested pages;
- connected notes and graph edges use canonical slugs;
- ambiguous backlinks create no edge or backlink count;
- adding or removing a duplicate changes resolution on the next watcher reconciliation;
- cache-version mismatch rebuilds the disposable index.

### Server contract tests

- `/api/wiki/Note` returns the unique nested page;
- exact full-path routes remain unchanged;
- ambiguous basename routes return structured candidates;
- missing routes remain 404;
- rendered Markdown contains canonical full-path hrefs.

### Client tests

- direct Wiki ambiguity chooser renders complete paths and navigates canonically;
- Explorer renders the same chooser;
- choosing a candidate replaces the unresolved tab;
- keyboard activation and focus behavior remain accessible;
- existing missing-note recovery remains distinct.

### Verification

Run:

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
```

No new production dependencies are required.
