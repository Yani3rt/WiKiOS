# Home Section Icons Design

## Goal

Add a distinct semantic outline icon to every Home knowledge-section heading so
the sections are easier to identify at a glance.

## Approved visual treatment

Use small inline `lucide-react` outline icons immediately before each heading:

- Recently updated: `FileClock`
- Recently visited: `Eye`
- People: `Users`
- Highly connected: `Network`

The icons have no tile or background. They use the existing Home accent color,
sit on the heading baseline, and remain visually subordinate to the heading
text. Existing section dividers, descriptions, list rows, expansion controls,
spacing, and responsive layout remain unchanged.

## Architecture

Keep `HomeSection` reusable by accepting an `icon` prop instead of deriving an
icon from `sectionKey`. Each section view explicitly supplies its semantic icon.
`HomeSection` renders the icon and title in a compact flex row.

Icons are decorative because the adjacent heading already names the section.
Each icon therefore uses `aria-hidden="true"` and does not alter the heading's
accessible name.

## Testing

Extend the Homepage server-rendering test to verify:

- Every populated section renders its assigned Lucide icon.
- The icon SVGs are hidden from assistive technology.
- People remains conditional; when there are no People entries, neither its
  section nor its icon appears.
- Existing semantic landmarks, responsive section ordering, preview limits,
  links, and empty-state assertions continue passing.

## Constraints

- Use the existing `lucide-react` dependency.
- Add no production dependencies.
- Preserve unrelated working-tree changes.
- Keep section copy and responsive behavior unchanged.
