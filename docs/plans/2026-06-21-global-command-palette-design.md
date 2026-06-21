# Global Command Palette Design

## Goal

Add a command palette that is available throughout WikiOS, opens with Command-K on macOS or Control-K elsewhere, searches notes, and provides fast access to the three most recently opened notes.

## User Experience

- The palette opens as a modal from every application route.
- Opening the palette focuses its search field.
- With an empty query, the palette shows the three most recently opened unique notes.
- Typing filters notes by title and file path.
- Clicking a result, or selecting it with the arrow keys and pressing Enter, opens that note in Explorer and closes the palette.
- Escape closes the palette and restores focus to the element that opened it.
- Notes opened through Explorer, wiki pages, search, links, or the palette update the recent-note list.
- Recent notes persist across sessions.

## Architecture

Introduce a shared application-shell route that renders the command palette alongside an `Outlet`. All existing routes become children of this shell, keeping one keyboard listener and one palette state owner inside the router context.

The palette uses the existing `/api/explorer` note index. The index can be loaded lazily when the palette first opens and retained for subsequent openings. No new production dependency is required.

A small recent-notes model stores up to three unique note references in `localStorage`. The app shell observes the current route. When it identifies a `/wiki/*` or `/explorer/*` note route, it promotes that note to the front of Recents. Entries no longer present in the note index are omitted.

## Components and Data Flow

- `AppShell` owns palette visibility, installs the global keyboard shortcut, observes route changes, and renders the route outlet.
- `CommandPalette` owns the query and keyboard selection state and renders the accessible modal.
- A command-palette model handles filtering, recent-note promotion, storage parsing, and serialization as pure functions.
- Selecting a note navigates to `/explorer/<encoded-slug>`, allowing the existing Explorer route to open or activate its tab.

## Accessibility and Interaction

- Use dialog semantics with an accessible label.
- Trap focus while open and restore prior focus after closing.
- Support Arrow Up, Arrow Down, Enter, and Escape.
- Prevent the browser's default Command-K or Control-K behavior when the app shortcut is handled.
- Use a backdrop and restrained entrance transition, respecting reduced-motion preferences.
- Distinguish the selected result with more than color alone.

## Loading and Failure States

- Show a compact loading state while the note index is fetched.
- Show an empty state when no notes match.
- If the note index cannot be loaded, show a quiet retryable error inside the palette without disrupting the current page.
- On setup routes or when no vault is available, the shortcut may still open the palette, but note search reports that notes are unavailable.
- Invalid or malformed stored recent-note data falls back to an empty list.

## Testing

- Unit-test recent-note deduplication, three-item limiting, storage parsing, and title/path filtering.
- Component-test shortcut handling, modal open/close behavior, keyboard navigation, Recents display, search results, and selection.
- Route-test that selecting a result navigates to the encoded Explorer URL.
- Verify that direct Wiki and Explorer note visits update Recents and that deleted notes are excluded.
- Run the full test suite, typecheck, lint, and browser-level interaction checks.

## Out of Scope

- Searching note body content.
- General actions beyond opening notes.
- User-configurable shortcuts.
- Synchronizing Recents between devices.
