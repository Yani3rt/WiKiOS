# Home Knowledge Dock Footer Design

## Goal

Finish the WikiOS Home page with a useful, distinctive footer that feels like the deep-teal hero returning at the end of the page rather than a generic site footer.

## Direction

Use a full-width “Knowledge Dock” with the same solid deep-teal token as the Home hero. The footer should feel calm, editorial, and purposeful: strong typography and useful actions provide the visual finish, without gradients, glass, glow, or decorative illustration.

## Content

The footer contains four functional layers:

1. **Closing prompt** — “Your knowledge, ready for the next connection.” with a short supporting sentence and a prominent action that scrolls to and focuses Home search.
2. **Explore** — links to Browse notes, Graph, and Stats.
3. **Vault utilities** — the current indexed-note count, Refresh index using the existing refresh flow and live status, and Change vault linking to `/setup?change=1`.
4. **Quick tip and lower strip** — a `⌘K` reminder for global search plus a compact local-first reassurance and WikiOS identity.

## Layout

- Full-bleed deep-teal background with a subtle teal border separating it from the pale page canvas.
- Content remains aligned to the existing `max-w-6xl` Home grid.
- Desktop uses a generous lead section followed by a balanced three-column utility grid.
- Mobile stacks the lead and utility groups with large touch targets and readable spacing.
- The footer follows both the discovery content and search-results view so it remains a consistent page ending.

## Components and Data Flow

- Add a focused `HomeFooter` component rather than expanding the already-large SearchBox render tree.
- `SearchBox` owns search focus and refresh behavior, so it passes the footer `totalPages`, refresh status, refresh busy state, `onRefresh`, and `onFocusSearch` callbacks.
- Reuse the existing Home tokens and refresh request; add no API endpoint or dependency.
- Keep visible and accessible refresh feedback synchronized with the hero refresh control.

## Interaction and Motion

- Search action scrolls the existing search input into view and focuses it.
- Footer links and buttons use the same restrained teal hover/focus vocabulary as the hero.
- Any smooth scroll respects `prefers-reduced-motion`; reduced-motion users jump directly.
- No entrance choreography or decorative animation.

## Accessibility

- Use a semantic `<footer>` with labelled navigation groups.
- Maintain 44px minimum interactive targets and WCAG 2.2 AA contrast.
- Expose refresh progress with `aria-busy` and the existing polite/error status messages.
- Use real links for navigation and a button only for search focus and refresh actions.

## Testing

- Verify footer structure, route links, note count, refresh wiring, and search-focus wiring.
- Verify footer and hero share the same background token.
- Verify keyboard focus and reduced-motion handling in source-level regressions.
- Run focused tests, full Vitest, lint, typecheck, production build, and `git diff --check`.
