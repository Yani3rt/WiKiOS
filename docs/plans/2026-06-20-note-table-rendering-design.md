# Note Table Rendering Design

## Goal

Improve Markdown table readability in notes and make wide tables usable on narrow screens without adding interactive table features.

## Scope

- Preserve semantic HTML table structure and Markdown alignment.
- Add a dedicated responsive wrapper around rendered Markdown tables.
- Give tables a polished visual hierarchy through header, cell, border, row, and link styling.
- Allow horizontal touch scrolling when a table is wider than the note column.
- Keep the implementation dependency-free.

Sticky headers, sorting, filtering, column resizing, and mobile card transformations are intentionally out of scope.

## Rendering Approach

`NoteViewer` will provide a custom `table` component to `react-markdown`. The component will retain the generated `<table>` and place it inside a presentation-neutral wrapper responsible only for overflow and surface styling.

The wrapper will:

- remain within the note content width;
- scroll horizontally instead of expanding or clipping the page;
- support momentum scrolling on touch devices;
- expose a subtle scrollbar when overflow exists.

The table will have a sensible minimum width so narrow viewports scroll rather than compressing content into unreadable columns.

## Visual Design

- Rounded outer border matching the existing note palette.
- Lightly tinted header background with stronger type hierarchy.
- Comfortable, consistent cell padding.
- Fine row and column separators.
- Subtle alternating row backgrounds and restrained hover feedback.
- Links continue to use the existing note-link treatment.
- First and last cells align cleanly with the rounded surface.

The styling will live under `.prose-wiki` so it applies only to rendered note content and remains consistent in both the wiki route and shared explorer viewer.

## Accessibility and Behavior

- Keep native `table`, `thead`, `tbody`, `tr`, `th`, and `td` elements.
- Do not add misleading ARIA roles to the visual wrapper.
- Preserve source-defined text alignment from GFM tables.
- Maintain keyboard and pointer access to links inside cells.
- Avoid converting rows into cards because that weakens the relationship between headers and cells.

## Testing

- Add a focused note-viewer rendering assertion for the responsive wrapper and semantic table output.
- Verify GFM tables still render header and body cells.
- Run the relevant test file, full test suite, typecheck, and lint.
- Visually verify a wide table at desktop and narrow note-viewer widths.

