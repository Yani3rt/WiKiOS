# 2D neural graph and explicit color groups

## Approved design
2D first, no new dependencies. Positions remain link-driven. Per-vault color mode: tags/topics (default), folders, none. Ordered topic priority controls multi-topic assignment. Unmatched notes are neutral. Do not use inferred categories as explicit topic provenance. Legend highlights actual groups; inspector identifies the color owner and lists explicit topics. Preserve existing workspace changes.

## Implementation plan
- [x] Add failing tests for explicit graph color sources (frontmatter vs folder vs inferred), deterministic ordered group assignment, and isolated per-vault preferences.
- [x] Expose explicit topic/folder sources from indexed markdown in graph query, without changing category behavior elsewhere.
- [x] Implement a pure grouping model and resilient local per-vault preferences, defaulting to alphabetical explicit topic priority on first visit.
- [x] Add accessible color mode, priority editor, clickable counted legend; recolor renderer in place without rerunning layout. Use same assignment for inspector/connection dots.
- [x] Refine graph-only visual tokens and chrome, retaining theme support, accessible navigation and reduced motion.
- [x] Run focused tests, typecheck, build, and browser verification. Document any remaining limits accurately.

## Validation cases
A note tagged [Writing, Research] uses Research when priority is [Research, Writing], regardless of tag order. A note without explicit topics remains neutral even if inferred categories exist. Folder mode uses actual first folder path. None assigns every note neutral. Two vault identifiers never share preferences. Legend counts sum to note count; highlight does not change topology or layout.

## Verification and handoff
- Typecheck, targeted ESLint and client production build pass; build retains the large-chunk warning. Full test suite passes (305 tests).
- Browser verified real indexer -> graph colors with a temporary 48-note tagged demo, priority reordering, persistence on reload, legend highlight, note inspector, None/Folder modes, mobile 390x844 and desktop 1440x900. No browser errors reported.
- Explicit topic provenance is stored in explicit_topics_json; cache version is 9. Old caches automatically rebuild from source notes; source Markdown is not modified.
- Per-vault preferences are localStorage-backed in the current browser, not synced to a vault config file. Topics are explicit configured frontmatter fields; inline body hashtags are not parsed.
- 3D and new rendering dependencies deferred. Large-vault performance has not been benchmarked.
- Existing unrelated workspace edits preserved; work is uncommitted on feat/graph-2d-topics.
