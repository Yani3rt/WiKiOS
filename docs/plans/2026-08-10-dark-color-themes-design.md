# Dark Color Themes Design

## Goal

Add a complete dark appearance to WikiOS while preserving the existing Teal,
Blue, and Violet color identities. The result is six visual combinations:
Teal Light, Blue Light, Violet Light, Teal Dark, Blue Dark, and Violet Dark.
Users can choose System, Light, or Dark independently from the color family.

## Scope

This change includes:

- Three family-tinted dark palettes for Teal, Blue, and Violet.
- A persisted mode preference with System, Light, and Dark options.
- Live operating-system appearance updates while System is selected.
- A combined Appearance panel for mode and color selection.
- Dark-mode support across every route, shared overlay, reader surface, Sigma
  graph, and Mermaid diagram.
- Automated contrast checks and full desktop/mobile browser verification.

This change does not include custom themes, scheduled themes, cross-device
preference synchronization, layout or typography redesigns, or new production
dependencies.

## Theme Model

Keep color family and brightness as orthogonal axes:

```html
<html data-color-theme="teal" data-mode="dark">
```

The color family remains `teal | blue | violet`. The stored mode preference is
`system | light | dark`, while the resolved mode applied to the document is
always `light | dark`.

A unified appearance provider owns:

- the selected color family;
- the stored mode preference;
- the resolved mode;
- commands to select a color or mode.

Color and mode use separate stable `localStorage` keys. Before React renders,
startup reads both values, resolves System with `prefers-color-scheme`, and
applies both root attributes. This prevents a light flash before routed content
appears.

When System is selected, the provider subscribes to operating-system appearance
changes and updates the resolved mode immediately. Choosing explicit Light or
Dark stops following the operating system. An invalid color falls back to Teal;
an invalid mode falls back to System. If `matchMedia` is unavailable, System
resolves to Light. Storage and media-query failures must not interrupt startup.

Wiki configuration variables are still applied after root theme initialization,
so `wiki-os.config.ts` variable overrides retain highest priority.

## Appearance Selector

The shared header palette control opens a compact panel titled **Appearance**.
It contains two labeled native radio groups:

- **Mode:** System, Light, Dark.
- **Color:** Teal, Blue, Violet.

The panel adds no subtitle, helper text, or redundant description. The mode
control uses concise text and familiar system/sun/moon icons. Color choices keep
their labeled swatches. Selected state is communicated through text and shape or
check treatment, never color alone.

Color swatches reflect the currently resolved mode. System therefore previews
dark swatches on a dark operating system and light swatches on a light operating
system.

Changing either selection applies immediately and leaves the panel open so both
axes can be adjusted in one visit. The panel closes through its trigger, outside
pointer input, or Escape. Escape returns focus to the trigger. Existing radio,
dialog, focus-visible, and 44-pixel compact-control accessibility requirements
remain.

## Palette System

Each of the six color/mode combinations defines a complete interface token set.
The existing three light palettes remain visually unchanged. Dark palettes use
the same hierarchy and approximate luminance steps with different family hues:

- a darkest, low-chroma tinted canvas;
- slightly lighter surfaces, subtle surfaces, and raised panels;
- bright primary text and restrained muted text;
- lighter family accents for links, controls, focus, and selected states;
- visible borders and control boundaries appropriate for dark surfaces;
- dark-compatible overlays, skeletons, scrollbars, and shadows.

Teal, Blue, and Violet Dark use subtly tinted surfaces rather than sharing a
neutral charcoal base or filling the interface with saturated color. The family
identity remains strongest in active and interactive elements.

Berry stays the shared secondary accent across all three families, with a
dark-compatible foreground and soft surface. Success, warning, and error tokens
also receive dark variants so their meanings remain stable while meeting
contrast requirements. Graph relationship colors remain semantically distinct
from both the active family and Berry.

The document sets `color-scheme` from the resolved mode so native controls and
browser-rendered surfaces match the interface.

## Whole-App Behavior

Token-driven surfaces cover Home, Explorer, Graph, Stats, Wiki, Setup, loading,
empty and error states, search, command palette, dialogs, dropdowns, reader
content, tables, inline code, and mobile route chrome. Hard-coded light values
must be audited. Values representing interface chrome move to semantic tokens;
intentional data encodings and the established dark syntax-highlight block are
preserved.

Code blocks already use a dark syntax theme. Their surrounding border, shadow,
and inline-code treatment adapt to the selected mode without inverting code
colors.

### Sigma Graph

Graph renderer tokens require explicit RGB or hex values. The theme update path
must react to both color-family and resolved-mode changes, then mutate existing
Graphology node and edge attributes, Sigma settings, and labels in place. It must
not recreate Sigma, restart layout, reset the camera, change coordinates, or
reload graph data.

### Mermaid

Mermaid diagrams contain generated inline colors and cannot rely on outer CSS
alone. Diagram rendering receives mode-appropriate variables and reruns when the
resolved mode changes. Existing sanitization, strict security level, fallback,
and failure behavior remain unchanged.

## Accessibility and Contrast

Every palette must meet these minimum targets:

- 4.5:1 for normal text against its surface.
- 3:1 for large text, focus indicators, and control boundaries.
- Visible selected, hover, active, disabled, and focus-visible states.
- No status or selection communicated by color alone.
- Forced-colors behavior remains usable.
- Motion continues to respect the existing reduced-motion behavior.

System, Light, and Dark are announced through the Mode radiogroup; Teal, Blue,
and Violet are announced through the Color radiogroup. The trigger is labeled
“Choose appearance.”

## Verification

### Automated

- Test the color and mode registries, parsing, storage fallbacks, and persistence.
- Test synchronous root initialization for all preference combinations.
- Test System resolution, live media-query changes, listener cleanup, and the
  unavailable-`matchMedia` fallback.
- Test the provider state and document attributes.
- Test selector radio semantics, keyboard dismissal, focus restoration, and
  open-after-selection behavior.
- Assert complete token coverage for all six combinations and unchanged light
  Teal, Blue, and Violet values.
- Assert configuration overrides still run after theme initialization.
- Check contrast pairs across all six palettes.
- Test in-place Sigma updates for color and mode changes.
- Test Mermaid rerendering and theme variables across resolved-mode changes.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

### Browser

Inspect Home, Explorer, Graph, Stats, Wiki, and Setup in all six visual
combinations at desktop and mobile widths. Verify System while changing the OS
preference, persistence after reload, no initial light flash, selector keyboard
behavior, graph recoloring without camera movement, Mermaid diagrams, loading
and error states, reader/code/table content, and absence of stale light chrome.

## Acceptance Criteria

The feature is complete when:

1. Users can independently select System/Light/Dark and Teal/Blue/Violet.
2. System follows operating-system changes live; explicit modes do not.
3. Preferences persist per browser and initialize before React renders.
4. All six combinations have complete, accessible palettes.
5. Existing light themes remain visually unchanged.
6. Every route and shared overlay supports dark mode without stale light chrome.
7. Sigma and Mermaid update correctly without graph lifecycle regressions.
8. Configuration overrides retain precedence.
9. Automated and browser verification pass without adding a production
   dependency.
