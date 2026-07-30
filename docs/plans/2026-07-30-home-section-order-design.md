# Home Section Order Design

## Goal

Reorder the Home knowledge sections everywhere so recency is prioritized and
Highly connected always follows People.

## Approved order

1. Recently updated
2. Recently visited
3. People
4. Highly connected

The existing responsive column split remains in place. With all four sections
visible, desktop renders Recently updated and Recently visited in the left
column, then People and Highly connected in the right column. Because the DOM
contains the left column before the right column, mobile follows the same
approved sequence and Highly connected appears below People.

When People has no entries, it remains hidden. The resulting order is Recently
updated, Recently visited, then Highly connected, so Highly connected remains
last.

## Architecture

Keep section placement config-driven. Change the universal default
`homepage.sectionOrder` to:

```ts
["recentPages", "featured", "people", "topConnected"]
```

`HomepageContent` will continue filtering an empty People section before
splitting the remaining ordered keys at the midpoint. No data-loading,
section-rendering, styling, or expansion behavior changes are required.

## Testing

Add Homepage regression coverage that inspects rendered section positions:

- With People populated, assert the DOM order is Recently updated, Recently
  visited, People, Highly connected.
- With People empty, assert People is absent and Highly connected remains last.
- Preserve existing assertions for semantic section landmarks, preview limits,
  direct recent-note links, and the Recently visited empty state.

## Constraints

- Apply the order as the WikiOS default everywhere.
- Preserve configurable `homepage.sectionOrder` overrides.
- Preserve unrelated working-tree changes.
- Add no production dependencies.
