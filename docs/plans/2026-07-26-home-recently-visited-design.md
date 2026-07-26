# Home Recently Visited Notes Design

**Date:** 2026-07-26  
**Status:** Approved

## Goal

Replace the Home page's server-selected **Worth revisiting** section with a
device-local **Recently visited** section that reuses the note history already
maintained for the global command palette.

## User experience

- The section title is **Recently visited**.
- Its description is **Notes you opened most recently on this device.**
- It shows up to four notes in newest-first order.
- Each row links directly to the note and uses its vault path as secondary
  context.
- Visiting a note already in the history promotes it to the first position
  without creating a duplicate.
- When there is no history, the section remains visible with a concise prompt
  to open a note.
- Notes that were deleted or renamed after being recorded are omitted rather
  than shown as broken links.

The existing Home section position and visual treatment remain unchanged.

## Architecture

### Shared recent-note storage

Move the browser-storage boundary out of `AppShell` into a small shared module.
It will:

- read the existing `wiki-os:command-palette-recents` key safely;
- serialize and persist recent slugs safely;
- tolerate unavailable, malformed, or quota-limited `localStorage`; and
- continue using the current deduplication and promotion helpers.

Increase the shared history limit from three to four. The command palette and
Home page will therefore present the same four-note history.

### Home loader

The Home route loader will:

1. fetch the existing `/api/home` payload;
2. read the device-local recent slugs;
3. fetch `/api/explorer` only when at least one recent slug exists;
4. normalize Explorer page slugs with the existing command-palette helper; and
5. resolve the stored slugs into current pages while preserving their stored
   order.

The loader will return the existing Home data plus the resolved recent pages.
No recent-history data is sent to the server.

### Home rendering

`HomepageContent` will receive the resolved recent pages and render them in the
existing `featured` layout slot. The internal slot remains unchanged for
configuration compatibility, but its visible content becomes Recently visited.
The former server-computed `homepage.featured` list will no longer be rendered.

A dedicated recent-note row will use `ExplorerPage` data rather than inventing
missing summaries or backlink counts. It will show the note title and its vault
path.

## Data flow

```text
note route visit
  -> AppShell promotes decoded slug
  -> shared storage writes four-item history
  -> user returns Home
  -> Home loader reads local history
  -> /api/explorer resolves current note metadata
  -> HomepageContent renders ordered recent notes
```

## Failure handling

- **No storage access:** render the empty-state prompt.
- **Malformed stored data:** treat it as an empty history.
- **Explorer request failure:** keep the rest of Home usable and render the
  empty-state prompt for Recently visited.
- **Stale slug:** omit the unmatched item.
- **No recent slugs:** skip the Explorer request entirely.

The existing `/api/home` failure behavior remains unchanged because that data is
required for the rest of the Home page.

## Testing

Tests will verify:

- the shared history stores four unique slugs in newest-first order;
- promotion and serialization remain capped at four;
- storage reads and writes tolerate unavailable or failing `localStorage`;
- the Home loader skips `/api/explorer` when history is empty;
- stored slugs resolve in history order and stale slugs are omitted;
- the Recently visited heading, description, note paths, and empty state render;
  and
- Worth revisiting copy and the old featured list are no longer rendered.

## Non-goals

- Synchronizing history between devices or browsers.
- Storing timestamps or visit counts.
- Adding a server-side recent-history database.
- Changing the visual layout of the other Home sections.
