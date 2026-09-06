# Design QA — Continuous workspace

Status: passed

## Target and evidence
- Approved concept: /Users/yani/.codex/generated_images/01a07373-c206-7e00-9302-bc4d03e1bc60/exec-9e421987-70cf-4cb9-af86-df5b9a8e8942.png
- Desktop evidence: docs/redesign/desktop.jpg (1440 × 1024)
- Mobile evidence: docs/redesign/mobile.jpg (390 × 844)
- Local preview: http://127.0.0.1:5311/explorer/Getting%20started/How%20this%20vault%20works
- Preview uses synthetic notes in /tmp/wiki-redesign-vault; no user notes were modified.

## Visual review
Opened the source concept and live screenshot together. Matched the dark violet editorial direction, serif title hierarchy, quiet navigation, tabs, breadcrumb, directional connections, and contextual table of contents. Increased initial implementation's body and navigation type sizes after comparison. Also checked settled light mode and the responsive reader.

Intentional adaptations: compact navigation and connection columns leave more reading space; Activity replaces Recent and adds the requested chronological views; dates, note counts, snippets and pinned items reflect actual demo data rather than mockup copy. Vault settings replaces the mockup's unverified sync status. Person controls remain available under Note options. Existing color and mode preferences remain respected.

## Interaction checks
- Sidebar folders, selection, pinning and persistent tabs.
- Activity Newly added / Last updated / Recently opened; selecting a note returns to the reader.
- Activity list is bounded to 100 entries per batch, with Show more.
- Distinct outgoing and incoming links with real source excerpts; map view renders and provides accessible note controls.
- Full graph navigation and home return restore the active tab and canonical URL.
- Phone-sized Connections drawer focuses its close button; Escape restores the trigger; background controls are inert.
- Mobile TOC closes the drawer and scrolls the reader (observed scrollTop 818).
- No horizontal overflow at 390px.
- Appearance menu opens upward from the sidebar footer; dark violet and light violet remain readable.
- Browser error log empty after exercised interactions.
- Automated regression coverage includes keyboard tabs, drawer focus, reading-position persistence, Activity/history navigation, vault isolation, timestamp preservation and directional links.

## Corrections during QA
Fixed clipped footer appearance menu, tablet Connections breakpoint semantics, Activity hiding URL-selected notes, Source Notes TOC targets, desktop collapse focus, empty-root tab restoration, hidden-reader scroll overwrite, and mobile TOC dismissal. Kept restrained entrance motion behind prefers-reduced-motion.

## Known boundaries
First seen means first indexed, not historical file creation. It survives note edits and forced reindex, but recreating the index resets it. Imported notes initially share the indexing period. Existing graph/Mermaid build chunk-size warnings remain; no new production dependencies were added. Browser screenshots are JPEG captures, not generated mockups.

## Final validation
- pnpm test: 278 tests across 33 files passed.
- pnpm typecheck: passed (client and server).
- pnpm lint: passed.
- pnpm build: passed.
- git diff --check: passed.
- Global command palette loaded the correct vault-scoped recently opened notes in the browser.
- Changes are uncommitted; no push or deployment was performed.

## Theme picker refinement
Replaced tall theme cards and repeated headings/Selected copy with one segmented System/Light/Dark control and a row of accent swatches. Kept named native radios, unique group IDs per picker, selected checkmarks, persistence and focus styling. Escape now stops at the picker rather than dismissing the enclosing mobile sidebar. Six picker DOM tests, client/server typecheck and lint passed. Verified the compact upward-opening picker in the live browser.

## Sidebar control affordances
Quick search is now a borderless command action with a small shortcut badge, distinct from the editable tree filter. Both vault links target /setup?change=1; first-time /setup redirects configured users back home. The top link explicitly says Change vault rather than suggesting an unimplemented inline dropdown. Verified Vault settings opens Choose your vault in the browser. Existing management lists up to eight successfully opened recent vaults; this demo process is intentionally locked by WIKIOS_FORCE_WIKI_ROOT, and the page explains that limitation. Thirteen targeted Explorer/setup tests, typecheck and lint passed.

## Inline vault switcher
Implemented the requested sidebar dropdown using the existing recent-vault API. The trigger displays the actual current vault name; the dropdown marks it with a check, lists other recent vaults with disambiguating paths, switches directly through the existing validated setup endpoint, and offers Open another vault. Session locks and unavailable folders disable switching; failed requests preserve the existing workspace and show an error. Escape closes only this dropdown and restores focus. Live-browser validation confirmed placement and the demo's locked/empty state; DOM tests cover successful switching, failures, unavailable folders, locks and dismissal. Client/server typecheck and lint passed. No production dependencies or user vault changes.

## Note previews
Added one delegated preview layer for note-tree items, pins, connection lists and internal Markdown links. Desktop hover/keyboard focus waits 350ms; touch taps open a compact bottom sheet. The card shows a plain-text excerpt, updated date and explicit Open in tab action through the existing workspace navigation. Requests are abortable, cached for 30 seconds (20-note bound), and include retry/error handling. Escape restores source focus without reopening.

Validation: 290 tests across 35 files passed, including five preview behavior tests (delay, explicit navigation, touch interception, Escape/focus restoration, excerpt extraction). Client/server typecheck, lint and production build passed. Existing large graph/Mermaid bundle warnings remain. Live-browser verification confirmed card rendering, keyboard traversal and opening an existing note tab without replacing other tabs; no browser console errors. Mobile tap behavior was verified in DOM tests, not on a physical device. Focus mode and in-note find remain next steps. No dependencies added, commits made or user vault files modified.

## Focus mode and tablet Find in note
Implemented the approved reading tools. Focus mode hides navigation, tabs and Connections without unmounting the reader or rewriting saved layout preferences; a persistent toolbar toggle and Escape restore the layout. Scroll position is carried through each layout change.

Find in note mounts only at the existing 768px tablet breakpoint and above. It searches rendered text, matches across inline formatting, treats queries literally, highlights all matches with an emphasized active result, reports counts and wraps previous/next navigation. Enter/Shift+Enter navigate; Escape closes Find before focus mode. Cmd/Ctrl+F opens it where supported; phones retain native browser Find. Highlights are removed on close, note changes and unmount. CSS Custom Highlights avoid rewriting React-owned Markdown. Older browsers without this API retain their native Find command.

Validation: 302 tests across 38 files passed, including focus restoration, phone exclusion/tablet resize, range matching, counts, navigation and cleanup. Typecheck, lint and production build passed (existing chunk-size warnings only). Live browser verified focus layout, highlighted results, Enter navigation and two-step Escape restoration. Temporary demo fixtures were recreated under /tmp after the previous fixture directory was no longer present; no user vault files changed. No production dependencies added or commits made.
