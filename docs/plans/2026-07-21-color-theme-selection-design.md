# Color Theme Selection Design

## Goal

Add a user-facing color theme selector to WikiOS while preserving the current light interface, route behavior, and teal design as the default. The initial catalog contains Teal, Blue, and Violet. Dark themes remain a separate future phase.

## Scope

The first release includes:

- Three built-in light color themes: Teal, Blue, and Violet.
- A shared Theme control in Home and inner-route page chrome.
- Immediate theme application without navigation or data reloads.
- Per-browser persistence through `localStorage`.
- Safe fallback to Teal when storage is missing, invalid, obsolete, or unavailable.
- Theme-aware Graph interface chrome without changing graph data encodings.

The release does not include dark themes, automatic system-theme detection, custom theme creation, cross-browser preference sync, typography or layout changes, or new production dependencies.

## Architecture

Use an attribute-driven CSS token system. The document root receives:

```html
<html data-color-theme="teal">
```

The supported values are `teal`, `blue`, and `violet`. Global CSS defines one complete product-token preset for each value. Existing Home, Explorer, Graph, Stats, Wiki, Setup, command-palette, and state-view aliases continue consuming the shared tokens, so the feature does not require route-by-route palette logic.

A small React `ThemeProvider` owns the selected theme, exposes it through context, and applies `data-color-theme` to the document root. It initializes from browser storage before the routed interface renders. The provider falls back to Teal for unknown values and handles unavailable storage without interrupting the app.

Keep future light/dark mode orthogonal to color family. A later release can add `data-mode="light|dark"` and paired token blocks without changing the stored color-theme ID or the selector contract.

## Configuration Precedence

The cascade order is:

1. Built-in Teal fallback tokens.
2. The selected built-in color-theme preset.
3. CSS-variable overrides from `wiki-os.config.ts`.

Runtime configuration overrides remain the highest authority so existing installation-specific customization does not silently stop working. A selected preset controls every token that the installation has not explicitly overridden.

## Theme Registry and Persistence

Define a typed theme registry containing each theme's:

- Stable ID.
- Display name.
- Preview swatches for deep chrome, soft accent, and canvas.

Use a version-stable `localStorage` key dedicated to the color theme. Parsing accepts only IDs present in the registry. Missing, malformed, or obsolete values resolve to Teal.

Selecting a theme updates provider state, applies the root attribute immediately, and attempts to persist the new ID. If persistence fails, the in-memory choice remains active for the current session. Storage errors must never block rendering or surface as route errors.

## Selector UI

Create one reusable `ThemeSelector` component. Place it in:

- The Home header beside the indexed-note count.
- The action area of Explorer, Graph, Stats, Wiki, and Setup headers.
- Shared error or fallback chrome where a normal route header is present.

Use a palette icon with the visible label **Theme** when space permits. Compact layouts may use an icon-only trigger with an accessible name.

The trigger opens a small anchored, non-modal popover. The options form a labeled radio group containing Teal, Blue, and Violet. Each option includes:

- The theme name.
- A three-swatch visual preview.
- An explicit selected checkmark or equivalent state indicator.

Selection applies instantly and the popover remains open so users can compare themes. The popover closes through Escape, an outside click, or the trigger. Keyboard navigation and focus return follow standard popover and radio-group behavior. Selection is never communicated by color alone.

Use the existing short color transitions only. Do not add decorative motion, and continue respecting reduced-motion preferences.

## Palette Rules

Teal remains visually unchanged and becomes the canonical default preset.

Blue and Violet preserve the current light hierarchy:

- A deep masthead and primary-action color with readable light foregrounds.
- A near-white tinted surface.
- A pale canvas, hover, and selection color.
- A strong accent for links, focus rings, icons, and active states.
- Primary and muted ink colors tuned for readable text on the light surfaces.
- Control borders that remain visible without becoming decorative.

Tune each palette deliberately in OKLCH rather than generating it through a blind hue rotation. Preserve the existing calm, search-first interface and avoid gradients, glass, glows, or arbitrary multicolor decoration.

Semantic success, warning, and error colors remain stable across all themes. Theme color must not replace state meaning.

## Graph Behavior

Graph interface chrome follows the selected theme, including its canvas, panels, controls, default nodes, muted nodes, labels, and neutral edges.

Category colors and incoming/outgoing relationship colors remain independent because they encode data rather than product chrome. Topic aliases remain untouched.

Sigma accepts hex and RGB(A), not OKLCH. Every theme therefore supplies renderer-safe hex or RGB values for the CSS tokens read by the Graph renderer. The Graph subscribes to the selected theme and refreshes or rebuilds its renderer palette after a change without reloading graph data or navigating.

## Accessibility

- Body text meets WCAG 2.2 AA at 4.5:1 or better.
- Large text and non-text control boundaries meet at least 3:1.
- Focus indicators remain visible on deep chrome and light surfaces in all themes.
- The selector uses labels, radio semantics, and a selected indicator in addition to color.
- Compact icon-only triggers retain an accessible name.
- Escape, outside-click dismissal, keyboard selection, and focus return are supported.
- Semantic states and graph relationships remain understandable without relying on the selected product hue.

## Verification

### Automated

- Unit-test valid, missing, malformed, and obsolete stored theme values.
- Test safe behavior when storage throws during reads or writes.
- Test registry completeness and Teal fallback behavior.
- Verify the provider applies `data-color-theme` and preserves configuration override order.
- Render-test selector labels, radio semantics, accessible trigger names, and selected state.
- Verify all theme blocks define the required shared and renderer-safe Graph tokens.
- Confirm the Graph refreshes its renderer colors after a theme change.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

### Visual and interaction

- Inspect Home, Explorer, Graph, Stats, Wiki, and Setup in Teal, Blue, and Violet.
- Inspect desktop and compact/mobile header placement.
- Calculate representative text, control-boundary, and focus-ring contrast pairs.
- Check for stale teal interface chrome in Blue and Violet.
- Confirm semantic states and graph relationships remain distinct.
- Verify keyboard operation, focus return, outside-click dismissal, and reduced motion.

## Implementation Boundaries

- Do not add a production dependency.
- Do not change routing, API contracts, indexing, search, note rendering, setup behavior, or graph data.
- Do not alter typography, layout structure, or spacing except where required to fit the shared Theme control in existing page chrome.
- Do not implement dark mode in this change.
