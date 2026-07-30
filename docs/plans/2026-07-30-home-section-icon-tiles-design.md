# Home Section Icon Tile Design

## Goal

Align Home knowledge section headers with the icon, title, and subtitle composition used by the three destination cards.

## Approved treatment

- Apply the treatment to every Home knowledge section.
- Place each section icon inside a 40×40px soft-accent tile.
- Render the icon at 20px.
- Stack the title and subtitle immediately to the icon's right.
- Keep Show all aligned at the far right when present.
- Preserve the accent divider beneath the complete header.

## Responsive behavior

- Keep the icon, text stack, and Show all in one horizontal header row.
- Let the title/subtitle stack shrink safely on narrow screens.
- Keep the icon tile and Show all control from shrinking.

## Scope

The change affects only shared section-header composition. Section ordering, row dividers, progress bars, People rows, summaries, navigation, and hover behavior remain unchanged.

## Verification

- Assert all populated section headers use the icon-tile marker and shared size classes.
- Assert icons remain decorative.
- Run Homepage tests, typecheck, lint, and the full suite.
- Verify the live Home page visually at the available viewport.
