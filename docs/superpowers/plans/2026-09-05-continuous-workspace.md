# Continuous workspace redesign

## Approved direction
Implement the selected dark editorial mockup: persistent navigation, note tabs, focused reader, contextual Connections. Add Activity with Newly added, Last updated, and Recently opened. Preserve themes, markdown rendering, keyboard navigation, deep links, and responsive access. No new production dependencies, note mutations, automatic commits, or deployment.

## Decisions
- Explorer becomes home; existing wiki deep links enter the workspace.
- Activity exposes first indexed time separately from modification time, labeled First seen. Preserve first seen during updates and manual reindex; index recreation may reset it.
- Separate directional connections endpoint supplies outgoing links and incoming excerpts.
- Preserve tabs, pins, pane preferences and reading position; scope persisted workspace data to vault identity.
- Reuse local fonts, existing icon library, and theme tokens with restrained motion.

## Implementation order
1. Backend activity timestamps and directional connection queries with behavioral tests.
2. Workspace state and Activity controls with tests.
3. Sidebar, tabs, reader and Connections redesign; home routing.
4. Responsive, keyboard, loading and error refinements.
5. Tests, lint, typecheck, build, independent review and browser visual QA against approved image; save design-qa.md and leave local preview available.

## Acceptance scenarios
Opening home restores the active note. Newly added and Last updated sort independently. Edits preserve first seen. Tree, Activity, pins, palette and connections open canonical tabs. Reading position survives tab switches. Mobile drawers support Escape and focus restoration. Existing themes and Mermaid remain usable. Missing notes, ambiguous links and failed requests remain recoverable.
