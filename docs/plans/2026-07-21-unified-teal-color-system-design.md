# Unified Teal Color System Design

## Goal

Extend the Home page's committed teal palette and visual guidance across every user-facing WikiOS route so the application feels like one product without forcing every route into the same layout.

## Scope

The first pass covers:

- Home
- Explorer
- Graph
- Stats
- Wiki note reader
- Setup and vault switching
- Command palette
- Not-found and route-error states

This is a visual-system change only. It does not change routing, data loading, search, graph behavior, setup behavior, or note rendering.

## Direction

Use a shared palette with page-specific composition. Home keeps the large deep-teal search band. Inner routes use a compact deep-teal masthead or teal-led utility chrome appropriate to their task. The Graph keeps meaningful category colors; teal owns the interface rather than replacing data encodings.

Rejected alternatives:

- A large Home-sized hero on every route would overwhelm dense tools and long-form reading.
- Accent-only recoloring would be too subtle to create a coherent product identity.

## Shared Palette

Promote the approved Home OKLCH palette into global brand tokens:

- Deep teal: mastheads, primary actions, and strong active states.
- Bright teal: links, focus rings, icons, and key interactive emphasis.
- Pale teal: page canvases, selections, hover states, and icon wells.
- Near-white teal: reading and control surfaces.
- Teal-black and teal-muted: primary and secondary text on light surfaces.
- Forest: success only.
- Rust: error only.
- Amber: warning and limited chart comparison only.

Home-specific variables may alias the global tokens so its approved appearance remains unchanged. Existing route-specific tokens should map to the same system rather than introducing new arbitrary colors.

## Shared Chrome

Add reusable CSS classes for inner-route shells and headers:

- A teal-tinted application canvas.
- A compact deep-teal masthead with light brand text.
- Near-white header controls with teal text, or quiet teal controls on the masthead where appropriate.
- Consistent teal focus indicators.
- Consistent primary and secondary actions.

The shared classes should remain composable so Explorer, Graph, Stats, Wiki, and Setup retain their current responsive structures.

## Route Application

### Explorer

Use the deep-teal masthead, a pale-teal canvas, near-white sidebar and tab surfaces, soft-teal selection, and teal active-tab/icon states. Preserve the dense file-tree workspace and current mobile drawer behavior.

### Graph

Use a pale-teal graph canvas, near-white controls and panels, deep-teal primary actions, and teal focus/selection chrome. Keep node category colors and incoming/outgoing relationship colors because they encode information. Do not tint every node teal.

### Stats

Replace the pastel rainbow and glow treatment with teal-dominant cards, headings, bars, and icon accents. Use amber sparingly where a second comparison color is needed. Keep the existing data and responsive grid.

### Wiki Reader

Use a compact deep-teal masthead, near-white reading surface, teal links and metadata accents, and pale-teal supporting panels. Preserve the calm editorial reading typography and all article navigation behavior.

### Setup

Remove decorative radial gradients. Use a pale-teal canvas, compact teal masthead, near-white form surfaces, deep-teal primary action, and semantic forest/rust/amber feedback. Preserve all vault selection and recovery behavior.

### Command Palette

Replace translucent glass with an opaque near-white surface. Use a solid pale-teal selected result, teal icon wells, and a conventional border/focus treatment. Remove the gradient selection, accent side rail, and backdrop blur while preserving keyboard and search behavior.

### Error and Not-Found States

Use the shared tinted canvas, teal code/title emphasis, and shared primary action. Error messaging remains textual and does not rely on color alone.

## Accessibility

- Body text must meet WCAG 2.2 AA at 4.5:1 or better.
- Large text and non-text interface boundaries must meet at least 3:1.
- Focus indicators must remain visible on both deep-teal and light surfaces.
- State meaning must remain available through labels, icons, and structure.
- Forced-colors behavior must preserve boundaries and focus.

## Visual Constraints

- No gradients.
- No glass or backdrop blur.
- No glows.
- No decorative colored side rails.
- No random pastel cycling.
- No page-load decoration or new motion.
- No new production dependencies.

## Verification

- Add source-level tests for shared route classes, global OKLCH tokens, and removal of rejected treatments from affected surfaces.
- Verify focused route tests and the complete test suite.
- Run lint, typecheck, and production build.
- Run the deterministic design detector and distinguish new route-specific findings from pre-existing unrelated rules.
- Calculate representative foreground/background and control-boundary contrast pairs.
- Inspect desktop and mobile layouts when browser access is available.
