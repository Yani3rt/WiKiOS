# Home People Divider Removal Design

## Goal

Remove the horizontal rules between People rows on the Home page.

## Approved treatment

- Disable list dividers only for the People section.
- Keep the current row spacing unchanged.
- Preserve avatars, names, backlink counts, navigation, and hover-card behavior.
- Keep Recently updated and Recently visited dividers unchanged.
- Keep Highly connected divider-free as already designed.

## Verification

- Assert the People list omits the `divide-y` class.
- Assert a divider-based section still retains it.
- Run Homepage tests, typecheck, lint, and the full suite.
- Verify the live Home page when People data is available.
