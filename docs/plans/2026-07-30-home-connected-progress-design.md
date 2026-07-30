# Home Highly Connected Progress Design

## Goal

Make backlink strength immediately scannable in the Home page's **Highly connected** section.

## Approved treatment

- Keep each note name left-aligned on a single truncated line.
- Present the explicit backlink count as a compact teal tag pill on the right.
- Add a 4px rounded progress track beneath the name and pill.
- Fill the highest-backlink note to 100%.
- Fill every other note proportionally using `backlinkCount / highestBacklinkCount`.
- Remove the standard list divider lines from this section because the progress tracks replace them visually.
- Preserve the existing animated white-card hover treatment.

## Scope

The treatment applies only to **Highly connected**. Recently updated, Recently visited, and People retain their existing row layouts and dividers.

## Accessibility and edge cases

- Keep the backlink count as visible text in the pill.
- Mark the progress visualization decorative so it does not duplicate the count for assistive technology.
- Treat a zero maximum as zero progress to avoid invalid percentages.
- Keep link targets, expansion behavior, and ordering unchanged.

## Verification

- Unit-test percentage normalization, maximum handling, pills, and divider scoping.
- Run Homepage tests, typecheck, lint, and the full suite.
- Verify the desktop and mobile Home layouts in the live app.
