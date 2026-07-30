# Home Section Header Divider Design

## Goal

Move each Home knowledge section's accent divider below its header content.

## Approved treatment

- Apply the pattern to every Home knowledge section.
- Remove the 2px accent border from the section's top edge.
- Add the same divider beneath the complete header block:
  - icon and title,
  - description,
  - Show all control when present.
- Keep a small gap between the divider and the first row.
- Preserve section-to-section spacing.

## Scope

The change affects only the shared section-header divider. Existing note-row dividers, Highly connected progress bars, People divider removal, hover cards, and expansion behavior remain unchanged.

## Verification

- Assert the section wrapper no longer owns `border-t-2`.
- Assert the header wrapper owns the accent bottom border.
- Confirm all section headers use the shared pattern.
- Run Homepage tests, typecheck, lint, and the full suite.
- Verify the live Home page visually.
