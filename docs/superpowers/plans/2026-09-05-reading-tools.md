# Reading Tools Implementation Plan

**Goal:** Focus mode on every viewport; Find in note only at 768px and above.
**Architecture:** Keep layout preferences and reader mounted while focus mode hides chrome. Find searches rendered text using DOM Ranges and CSS highlights, without mutating React-owned markup. A compact toolbar panel owns its query, match navigation and cleanup.
**Constraints:** No dependencies, no redundant copy, no commits. Preserve current uncommitted redesign. Native browser find remains unchanged below 768px.

- [x] Add DOM regression tests for focus restoration and mobile find exclusion.
- [x] Implement focus toggle, Escape handling and scroll preservation in Explorer.
- [x] Implement FindInNote and range collector; match count, next/previous, Enter/Shift+Enter, Escape, cleanup on note/viewport changes.
- [x] Verify range matching across inline markup, case-insensitive literal queries and highlight cleanup.
- [x] Run tests, typecheck, lint and build; inspect live UI.
