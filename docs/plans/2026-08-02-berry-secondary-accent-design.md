# Berry Secondary Accent Design

## Goal

Add Berry as a restrained, shared secondary accent that complements WikiOS's
Teal, Blue, and Violet themes without replacing their primary product colors or
the stable semantic status palette.

## Color

- Strong: `oklch(0.48 0.12 345)` (`#8B3E6D`)
- Soft: `oklch(0.92 0.03 345)` (`#F4DDE9`)

The strong value maintains at least 5.6:1 contrast against every current theme
canvas. Existing dark ink maintains greater than 12:1 contrast on the soft
value.

## Token Architecture

Define `--brand-secondary-accent` and `--brand-secondary-accent-soft` once in
the shared `:root` block. The values remain stable across color themes, just as
success, warning, and error remain stable. Do not duplicate the tokens inside
the Teal, Blue, or Violet presets.

The existing `--brand-accent` tokens continue to own links, focus rings, active
navigation, selections, and primary interaction states.

## Application

Use Berry only for non-semantic secondary emphasis, with a consistent bias
toward rediscovery, recent local history, and supporting relationships:

- The Home **Recently visited** section heading, icon well, and interactions.
- The command palette's **Recently opened** mode and result icon wells. Typed
  search results return to the selected theme accent.
- Available **Recent vaults** icon wells in Setup; unavailable folders stay
  neutral.
- **Related Concepts** pills in the note reader.
- The Stats editorial eyebrow chip, Avg. Words card accent, and third color in
  the Most Backlinked Concepts bar sequence.

This creates a recognizable secondary discovery language and removes the prior
misuse of warning amber as decorative chart color. Graph relationship/category
colors, primary navigation, current selections, focus rings, and every semantic
state remain unchanged.

## Accessibility and Constraints

- Preserve WCAG 2.2 AA contrast.
- Do not communicate meaning through Berry alone.
- Do not use Berry for focus, selection, success, warning, or error.
- Do not apply Berry to core Explorer or Graph navigation; those surfaces need
  the selected theme color for wayfinding and data-legibility.
- Do not add gradients, glows, decorative rails, or new production dependencies.
- Keep the change token-driven so configuration overrides can customize it.

## Verification

- Add source-level tests for the exact shared tokens and Stats usage boundaries.
- Confirm Stats no longer uses warning amber for decorative accents.
- Run focused tests, lint, typecheck, the complete test suite, and production
  build.
