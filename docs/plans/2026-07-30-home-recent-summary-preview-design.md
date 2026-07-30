# Home Recently Updated Summary Preview Design

## Goal

Make Recently updated summaries compact, predictable, and visually recognizable.

## Approved treatment

- Apply the treatment to every Recently updated row that has a summary.
- Display the first 30 characters, counting spaces.
- Append `...` only when the original summary exceeds 30 characters.
- Prefix the preview with a small Lucide `ChevronRight` icon.
- Keep the full summary available in a native `title` tooltip.
- Leave the note title, backlink count, link target, and other Home sections unchanged.

## Accessibility

- Mark the chevron icon decorative with `aria-hidden="true"`.
- Keep the visible truncated text as real text content.
- Preserve the complete summary in the tooltip without adding duplicate screen-reader output.

## Edge cases

- Empty or missing summaries render no preview row.
- Summaries of exactly 30 characters do not receive an ellipsis.
- Short summaries remain unchanged.

## Verification

- Unit-test short, exact-length, long, and empty inputs.
- Assert the icon, tooltip, and visible preview in server-rendered Homepage markup.
- Run Homepage tests, typecheck, lint, and the full test suite.
- Verify the live Home page visually.
