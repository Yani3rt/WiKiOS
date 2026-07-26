# External Link Indicator Design

## Goal
Make rendered note links visually distinguish external websites from internal WikiOS note links.

## Problem
In the shared note viewer, Obsidian note links become `/wiki/...` links and external URLs render through the same markdown anchor renderer. Today they share the same visual styling, so readers cannot quickly tell whether clicking a link will navigate within the wiki or leave for another site.

## User Requirement
External links should have a visual indicator. The approved treatment is an inline trailing icon like `↗` shown only for external links.

## Current Context
- Shared note markdown rendering lives in `/Users/yani/Dev/wiki/wiki-os/src/components/note-viewer.tsx`.
- Obsidian `[[note]]` links are transformed into standard markdown links by `/Users/yani/Dev/wiki/wiki-os/src/lib/markdown.ts`.
- Internal wiki navigation is already detected in `wikiSlugFromHref`, `isWikiLinkHref`, and the shared anchor click interception logic.
- Shared note viewer tests already cover internal wiki-link interception and external-link pass-through in `/Users/yani/Dev/wiki/wiki-os/tests/shared-note-viewer.test.ts`.

## Chosen Approach
Add a subtle inline trailing external-link glyph (`↗`) inside the shared markdown anchor renderer, only when the link resolves outside the app’s internal routes.

## Detection Rules
Treat a link as internal when it points to:
- `#...` section anchors
- `/wiki/...`
- `/explorer/...`
- `/graph`
- `/stats`
- other same-origin in-app routes intentionally handled by WikiOS

Treat a link as external when it resolves to a destination outside those routes, including:
- `https://...`
- `http://...`
- other absolute URLs to different origins

## Visual Design
- External links keep the same base link styling as today.
- Add a trailing `↗` immediately after the link text.
- The icon should be slightly smaller and visually muted relative to the text.
- The icon is decorative and not independently clickable.
- Internal links remain unchanged.

## Accessibility
- External links should expose a screen-reader hint such as “opens external site”.
- The visible label text should not be duplicated.
- The icon itself should be `aria-hidden`.

## Scope
This change applies to rendered note markdown in the shared note viewer. It does not redesign unrelated navigation buttons or other app chrome.

## Testing Strategy
Add regression coverage to confirm:
- internal wiki links do not render the external icon
- external links do render the external icon
- internal wiki links still intercept and route correctly
- external links still do not get intercepted
