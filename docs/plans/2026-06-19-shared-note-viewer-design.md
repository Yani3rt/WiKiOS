# Shared Note Viewer Design

## Goal

Render notes through one full-featured viewer so `/wiki/:slug` and `/explorer/:slug` have identical article presentation and behavior while retaining route-specific navigation chrome.

## Shared viewer

Extract the article presentation from `wiki-route.tsx` into a focused `NoteViewer` component. It owns:

- title, portrait, reading time, word count, updated date, and person controls
- mobile and desktop table of contents
- active-heading tracking and smooth heading navigation
- Markdown rendering, syntax highlighting, and section splitting
- related-concept chips
- neighborhood graph

The viewer receives the current `WikiPageData` and a note-navigation callback. Internal wiki links, related concepts, and graph nodes use that callback, allowing each route to choose its own destination without duplicating article UI.

## Route wrappers

The direct wiki route keeps its existing site header and breadcrumb, then renders `NoteViewer` inside the existing centered article container.

The explorer route keeps its folder tree, tabs, persistence, URL synchronization, loading states, and mobile drawer. Its ready state renders the same `NoteViewer` inside the active tab panel. It does not render the direct route header or breadcrumb.

## Navigation

The direct route navigates shared viewer links to `/wiki/:slug`.

The explorer route resolves shared viewer links against explorer metadata, opens or activates the corresponding tab, and navigates to `/explorer/:slug`. Existing canonical slug and route/API encoding rules remain unchanged.

## Person controls and refresh

The shared viewer performs the existing person-override request and reports successful changes through an optional refresh callback.

The direct route uses React Router revalidation. The explorer route refetches the active note and replaces its slug-keyed reader state. Errors remain local to the person controls and do not discard the currently rendered note.

## Scroll behavior

The viewer accepts an optional scroll container. Direct pages use the browser window; explorer tabs use the reading panel. Active-heading tracking and smooth heading scrolling use the supplied container so TOC behavior works in both contexts.

When the active note changes, the direct route scrolls the window to the top and the explorer route scrolls its reader panel to the top.

## Testing

- Pure viewer utilities remain testable independently.
- Source/integration tests verify both routes import and render `NoteViewer`.
- Tests verify direct links target `/wiki/*` and explorer links activate explorer tabs.
- Existing explorer state, encoding, accessibility, and HTTP tests remain green.
- Browser QA compares the same sample note in both routes on desktop and verifies explorer tab navigation and TOC behavior.

No production dependencies are required.
