# Note Explorer Design

## Goal

Add a read-only workspace route where users browse the vault as a folder tree and open notes in persistent tabs.

## Route and layout

The feature lives at `/explorer`. A resizable-style two-panel layout presents a folder tree on the left and a tabbed note reader on the right. The first version uses a fixed sidebar width rather than implementing drag resizing.

On narrow screens, the tree becomes a toggleable drawer so the note remains the primary surface.

## Explorer data

Add `GET /api/explorer`, backed by the existing SQLite index. It returns a flat list of indexed note metadata:

- relative file path
- canonical slug
- display title
- modified timestamp

The client builds the nested folder tree from relative file paths. Keeping the API flat avoids coupling server queries to one visual tree structure and makes filtering straightforward.

Full note content continues to come from `GET /api/wiki/*`.

## Folder tree

The sidebar includes:

- expandable and collapsible folders
- note and folder icons
- a title or filename filter
- expand-all and collapse-all controls
- visible result counts
- active-note highlighting

Folders sort before notes. Both groups sort by display name using locale-aware comparison. Clicking a note opens it once or activates its existing tab.

## Tabs and routing

Each tab stores the note slug and title. Tabs support:

- activation
- individual close
- close others
- horizontal overflow scrolling

Open tabs and the active tab persist in `localStorage`. Persisted data is versioned and validated before use so stale or malformed values do not break the route.

The active note is represented in the URL, using `/explorer/:slug`. `/explorer` remains a valid empty workspace. URL changes, browser history, tree selection, and tab activation stay synchronized.

When a restored tab no longer exists, it remains available until selected; selecting it shows a missing-note state and allows the tab to be closed.

## Note reader

The reader is read-only and renders markdown with the same `react-markdown`, GFM, and syntax-highlighting stack used by the existing article route. The initial version presents the note title, relative filename, modified date, categories, and rendered body without duplicating the article route's graph and person-management features.

The workspace has explicit loading, request-error, missing-note, and no-tab states.

## Architecture

New shared explorer metadata types live in `src/lib/wiki-shared.ts`. The query is added to `src/lib/wiki-queries.ts`, exposed through `src/lib/wiki.ts`, and registered in `src/server/app.ts`.

Client-only tree construction and tab-state helpers are pure functions so they can be tested independently. The route component owns persistence, navigation synchronization, responsive sidebar state, and note loading.

No new production dependencies are required.

## Testing

Use test-first development for each behavior:

- server/query contract returns every indexed note with stable metadata ordering
- tree construction handles root notes, nested folders, and deterministic sorting
- tab helpers avoid duplicates and select a sensible neighbor when closing a tab
- persisted workspace state rejects malformed or outdated data
- route and endpoint integration preserve setup-required behavior

After focused tests pass, run the full `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` checks.
