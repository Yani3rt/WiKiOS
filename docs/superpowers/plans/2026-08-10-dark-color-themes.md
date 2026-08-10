# Dark Color Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add System, Light, and Dark appearance modes to the existing Teal, Blue, and Violet palettes so the entire app supports three light and three dark visual combinations.

**Architecture:** Preserve `data-color-theme="teal|blue|violet"` and add the orthogonal root attribute `data-mode="light|dark"`. A unified appearance provider persists the color and the `system|light|dark` preference separately, exposes the resolved mode, and listens to `prefers-color-scheme` only for System. CSS supplies complete six-combination token blocks; canvas and generated-SVG renderers consume the resolved mode explicitly.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Tailwind CSS 4, Vitest 3, Graphology/Sigma 3, Mermaid 11, browser `matchMedia` and `localStorage` APIs.

## Global Constraints

- Use `pnpm`; add no production dependency.
- Do not preserve backward compatibility; remove the superseded color-only provider API rather than maintaining aliases.
- Choose the simplest implementation that fully meets the approved design.
- Keep the existing Teal, Blue, and Violet light palettes visually unchanged.
- Keep `wiki-os.config.ts` CSS-variable overrides at highest priority.
- Do not add subtitles, helper text, or descriptive copy to the Appearance panel.
- Keep Sigma graph, camera, coordinates, and layout instances alive during appearance changes.
- Keep Mermaid `securityLevel: "strict"` and the existing fallback behavior.
- Design reference: `docs/plans/2026-08-10-dark-color-themes-design.md`.

---

## File Map

- `src/client/color-theme.ts` — existing color catalog, persistence, root attribute, and light/dark swatch previews.
- `src/client/theme-mode.ts` — new mode-preference model, system resolution, persistence, initialization, and media-query subscription.
- `src/client/appearance-provider.tsx` — new unified React context for color, mode preference, and resolved mode.
- `src/client/main.tsx` — synchronous color/mode initialization before configuration and React rendering.
- `src/components/theme-selector.tsx` — shared Appearance panel with Mode and Color radiogroups.
- `src/client/globals.css` — six complete palette blocks, light/dark semantic tokens, selector styling, renderer tokens, and removal of stale light-only chrome.
- `src/client/routes/graph-route.tsx` — in-place Sigma recoloring when color or resolved mode changes.
- `src/client/graph-overview-model.ts` — light/dark adaptation for configured category colors.
- `src/components/note-viewer.tsx` — mode-aware neighborhood canvas and serialized Mermaid rendering.
- `tests/theme-mode.test.ts` — mode model and system listener tests.
- `tests/appearance-provider.test.tsx` — provider and bootstrap-order tests.
- `tests/theme-selector.test.tsx` — Appearance interaction and accessibility tests.
- `tests/unified-color-system.test.ts` — six-block completeness, unchanged light values, dark semantic token, and hard-coded chrome audits.
- `tests/dark-theme-contrast.test.ts` — CSS token parsing and WCAG contrast matrix.
- `tests/graph-overview-model.test.ts` — mode-aware graph category and in-place renderer tests.
- `tests/shared-note-viewer.test.ts` — neighborhood canvas and Mermaid mode behavior.

---

### Task 1: Add the mode model and mode-aware color previews

**Files:**
- Create: `src/client/theme-mode.ts`
- Modify: `src/client/color-theme.ts`
- Create: `tests/theme-mode.test.ts`
- Modify: `tests/color-theme.test.ts`

**Interfaces:**
- Produces: `ThemeModePreference = "system" | "light" | "dark"`.
- Produces: `ResolvedThemeMode = "light" | "dark"`.
- Produces: `ThemeModeInitialization { preference: ThemeModePreference; resolvedMode: ResolvedThemeMode }`.
- Produces: `initializeBrowserThemeMode(root?, storage?, media?)` and `subscribeToSystemTheme(media, listener)`.
- Changes: `ColorThemeDefinition.preview` becomes `{ light: SwatchTuple; dark: SwatchTuple }`.

- [ ] **Step 1: Write failing mode-model and preview tests**

Create `tests/theme-mode.test.ts` with deterministic storage/root/media doubles:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_THEME_MODE_PREFERENCE,
  THEME_MODE_STORAGE_KEY,
  applyResolvedThemeMode,
  initializeBrowserThemeMode,
  parseThemeModePreference,
  persistThemeModePreference,
  readStoredThemeModePreference,
  resolveThemeMode,
  subscribeToSystemTheme,
} from "../src/client/theme-mode";

describe("theme mode model", () => {
  it("supports System, Light, and Dark with System as the fallback", () => {
    expect(DEFAULT_THEME_MODE_PREFERENCE).toBe("system");
    expect(parseThemeModePreference("light")).toBe("light");
    expect(parseThemeModePreference("dark")).toBe("dark");
    expect(parseThemeModePreference("unknown")).toBe("system");
    expect(parseThemeModePreference(null)).toBe("system");
  });

  it("persists preferences without allowing storage failures to escape", () => {
    const storage = { getItem: vi.fn(() => "dark"), setItem: vi.fn() };
    expect(readStoredThemeModePreference(storage)).toBe("dark");
    expect(persistThemeModePreference(storage, "light")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_MODE_STORAGE_KEY, "light");
    expect(readStoredThemeModePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
    expect(persistThemeModePreference({ setItem: () => { throw new Error("quota"); } }, "dark")).toBe(false);
  });

  it("resolves System from the media query and falls back to Light", () => {
    expect(resolveThemeMode("dark", { matches: false })).toBe("dark");
    expect(resolveThemeMode("light", { matches: true })).toBe("light");
    expect(resolveThemeMode("system", { matches: true })).toBe("dark");
    expect(resolveThemeMode("system", { matches: false })).toBe("light");
    expect(resolveThemeMode("system", null)).toBe("light");
  });

  it("initializes data-mode before rendering", () => {
    const root = { setAttribute: vi.fn() };
    expect(initializeBrowserThemeMode(root, { getItem: () => "system" }, { matches: true })).toEqual({
      preference: "system",
      resolvedMode: "dark",
    });
    expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "dark");
    applyResolvedThemeMode(root, "light");
    expect(root.setAttribute).toHaveBeenLastCalledWith("data-mode", "light");
  });

  it("subscribes and removes the same system listener", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const listener = vi.fn();
    const media = { matches: false, addEventListener, removeEventListener };
    const unsubscribe = subscribeToSystemTheme(media, listener);
    expect(addEventListener).toHaveBeenCalledWith("change", listener);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
```

Extend `tests/color-theme.test.ts` to assert exact preview keys and values:

```ts
expect(COLOR_THEMES.map(({ id, preview }) => ({ id, preview }))).toEqual([
  { id: "teal", preview: { light: ["#004950", "#00626c", "#ebf6f7"], dark: ["#101f21", "#67bfc6", "#18282a"] } },
  { id: "blue", preview: { light: ["#12426d", "#1a588f", "#eef4fb"], dark: ["#111b2a", "#7eb5ef", "#192333"] } },
  { id: "violet", preview: { light: ["#433567", "#5a4789", "#f4f2fb"], dark: ["#1d1828", "#b09be8", "#262032"] } },
]);
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/theme-mode.test.ts tests/color-theme.test.ts
```

Expected: FAIL because `theme-mode.ts` does not exist and `preview` is still a tuple.

- [ ] **Step 3: Implement the mode model**

Create `src/client/theme-mode.ts` with these exact public types and behaviors:

```ts
export const THEME_MODE_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemeModePreference = (typeof THEME_MODE_PREFERENCES)[number];
export type ResolvedThemeMode = Exclude<ThemeModePreference, "system">;

export const DEFAULT_THEME_MODE_PREFERENCE: ThemeModePreference = "system";
export const THEME_MODE_STORAGE_KEY = "wikios:theme-mode";

interface StorageReader { getItem(key: string): string | null; }
interface StorageWriter { setItem(key: string, value: string): void; }
interface ThemeRoot { setAttribute(name: string, value: string): void; }
export interface ColorSchemeMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener?(type: "change", listener: (event: MediaQueryListEvent) => void): void;
}
export interface ThemeModeInitialization {
  preference: ThemeModePreference;
  resolvedMode: ResolvedThemeMode;
}

export function parseThemeModePreference(value: string | null): ThemeModePreference {
  return THEME_MODE_PREFERENCES.includes(value as ThemeModePreference)
    ? (value as ThemeModePreference)
    : DEFAULT_THEME_MODE_PREFERENCE;
}

export function readStoredThemeModePreference(storage: StorageReader | null): ThemeModePreference {
  if (!storage) return DEFAULT_THEME_MODE_PREFERENCE;
  try { return parseThemeModePreference(storage.getItem(THEME_MODE_STORAGE_KEY)); }
  catch { return DEFAULT_THEME_MODE_PREFERENCE; }
}

export function persistThemeModePreference(storage: StorageWriter | null, mode: ThemeModePreference) {
  if (!storage) return false;
  try { storage.setItem(THEME_MODE_STORAGE_KEY, mode); return true; }
  catch { return false; }
}

export function resolveThemeMode(
  preference: ThemeModePreference,
  media: Pick<ColorSchemeMediaQuery, "matches"> | null,
): ResolvedThemeMode {
  if (preference !== "system") return preference;
  return media?.matches ? "dark" : "light";
}

export function applyResolvedThemeMode(root: ThemeRoot, mode: ResolvedThemeMode) {
  root.setAttribute("data-mode", mode);
}

export function browserColorSchemeMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try { return window.matchMedia("(prefers-color-scheme: dark)"); }
  catch { return null; }
}

export function subscribeToSystemTheme(
  media: ColorSchemeMediaQuery | null,
  listener: (event: MediaQueryListEvent) => void,
) {
  if (!media?.addEventListener || !media.removeEventListener) return () => undefined;
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}
```

Add `initializeBrowserThemeMode()` using `readStoredThemeModePreference()`,
`resolveThemeMode()`, and `applyResolvedThemeMode()` in that order. Its default
arguments must be `document.documentElement`, `browserThemeStorage()` imported
from `color-theme.ts`, and `browserColorSchemeMediaQuery()`.

Change `ColorThemeDefinition.preview` to:

```ts
type ThemePreview = readonly [deep: string, accent: string, canvas: string];
readonly preview: Readonly<Record<ResolvedThemeMode, ThemePreview>>;
```

Use the six exact tuples from the failing test.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/theme-mode.test.ts tests/color-theme.test.ts
pnpm typecheck
```

Expected: both test files PASS and both TypeScript projects pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/client/theme-mode.ts src/client/color-theme.ts tests/theme-mode.test.ts tests/color-theme.test.ts
git commit -m "feat: add theme mode model"
```

---

### Task 2: Replace the color-only provider with unified appearance state

**Files:**
- Create: `src/client/appearance-provider.tsx`
- Delete: `src/client/color-theme-provider.tsx`
- Modify: `src/client/main.tsx`
- Create: `tests/appearance-provider.test.tsx`
- Delete: `tests/color-theme-provider.test.tsx`
- Modify: `src/client/routes/graph-route.tsx` only to update the provider import/hook name; behavior changes in Task 5.
- Modify: `src/components/theme-selector.tsx` only to update the provider import/hook name; UI changes in Task 3.

**Interfaces:**
- Consumes: Task 1 mode functions and color functions.
- Produces: `AppearanceContextValue` with `colorTheme`, `modePreference`, `resolvedMode`, `selectColorTheme()`, and `selectModePreference()`.
- Produces: `AppearanceProvider`, `useAppearance()`, and `useResolvedThemeMode()`.

- [ ] **Step 1: Write failing provider and bootstrap tests**

Replace the color-provider test with `tests/appearance-provider.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppearanceProvider, useAppearance } from "../src/client/appearance-provider";

function Probe() {
  const value = useAppearance();
  return createElement("span", {
    "data-color": value.colorTheme,
    "data-preference": value.modePreference,
    "data-resolved": value.resolvedMode,
  });
}

describe("appearance provider", () => {
  it("provides initialized color, preference, and resolved mode", () => {
    const markup = renderToStaticMarkup(createElement(AppearanceProvider, {
      initialColorTheme: "violet",
      initialModePreference: "system",
      initialResolvedMode: "dark",
    }, createElement(Probe)));
    expect(markup).toContain('data-color="violet"');
    expect(markup).toContain('data-preference="system"');
    expect(markup).toContain('data-resolved="dark"');
  });

  it("initializes both root axes before config overrides and rendering", () => {
    const main = readFileSync(new URL("../src/client/main.tsx", import.meta.url), "utf8");
    const colorInit = main.indexOf("initializeBrowserColorTheme()");
    const modeInit = main.indexOf("initializeBrowserThemeMode()");
    const config = main.indexOf("applyThemeVariables(config)");
    const render = main.indexOf("createRoot(rootContainer).render");
    expect(colorInit).toBeGreaterThan(-1);
    expect(modeInit).toBeGreaterThan(-1);
    expect(Math.max(colorInit, modeInit)).toBeLessThan(config);
    expect(config).toBeLessThan(render);
  });
});
```

Add unit coverage in this file with mocked React hooks, root, storage, and media
to prove these transitions:

```ts
// Explicit selection: System dark -> Light
selectModePreference("light");
expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "light");
expect(storage.setItem).toHaveBeenCalledWith("wikios:theme-mode", "light");

// System media change: false -> true
mediaListener({ matches: true } as MediaQueryListEvent);
expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "dark");

// Cleanup when leaving System
expect(media.removeEventListener).toHaveBeenCalledWith("change", mediaListener);
```

- [ ] **Step 2: Run the provider test and verify it fails**

```bash
pnpm exec vitest run tests/appearance-provider.test.tsx
```

Expected: FAIL because `appearance-provider.tsx` does not exist.

- [ ] **Step 3: Implement unified appearance state**

Create the provider around this exact context contract:

```ts
interface AppearanceContextValue {
  colorTheme: ColorThemeId;
  modePreference: ThemeModePreference;
  resolvedMode: ResolvedThemeMode;
  selectColorTheme(theme: ColorThemeId): void;
  selectModePreference(preference: ThemeModePreference): void;
}
```

Implementation rules:

```tsx
const ResolvedModeContext = createContext<ResolvedThemeMode>("light");
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

// selectColorTheme
applyColorTheme(document.documentElement, theme);
persistColorTheme(browserThemeStorage(), theme);
setColorTheme(theme);

// selectModePreference
const media = browserColorSchemeMediaQuery();
const nextResolvedMode = resolveThemeMode(preference, media);
applyResolvedThemeMode(document.documentElement, nextResolvedMode);
persistThemeModePreference(browserThemeStorage(), preference);
setModePreference(preference);
setResolvedMode(nextResolvedMode);
```

The provider effect must subscribe only when `modePreference === "system"`.
On each media change, derive `event.matches ? "dark" : "light"`, apply the root
attribute, and update state. Return the unsubscribe function from the effect.

Nest `ResolvedModeContext.Provider` inside `AppearanceContext.Provider`.
`useAppearance()` throws outside the provider. `useResolvedThemeMode()` reads
the default-light context so isolated reader rendering remains safe in SSR tests.

In `main.tsx`, initialize both axes synchronously:

```tsx
const initialColorTheme = initializeBrowserColorTheme();
const initialThemeMode = initializeBrowserThemeMode();

<AppearanceProvider
  initialColorTheme={initialColorTheme}
  initialModePreference={initialThemeMode.preference}
  initialResolvedMode={initialThemeMode.resolvedMode}
>
  <RouterProvider router={router} />
</AppearanceProvider>
```

Keep `applyThemeVariables(config)` after both initializers and before React
rendering. Delete the color-only provider and update the two consumer imports to
`useAppearance()` without changing their behavior yet.

- [ ] **Step 4: Run provider, color, mode, and type tests**

```bash
pnpm exec vitest run tests/appearance-provider.test.tsx tests/color-theme.test.ts tests/theme-mode.test.ts
pnpm typecheck
```

Expected: all focused tests and both TypeScript projects PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/client/appearance-provider.tsx src/client/main.tsx src/client/routes/graph-route.tsx src/components/theme-selector.tsx tests/appearance-provider.test.tsx
git rm src/client/color-theme-provider.tsx tests/color-theme-provider.test.tsx
git commit -m "feat: provide color and appearance mode"
```

---

### Task 3: Turn the palette popover into the Appearance selector

**Files:**
- Modify: `src/components/theme-selector.tsx`
- Modify: `src/client/globals.css`
- Modify: `tests/theme-selector.test.tsx`

**Interfaces:**
- Consumes: `useAppearance()` and mode/color registries.
- Produces: `ModeOptions` and mode-aware `ThemeOptions`.
- Preserves: `createThemeSelectorDismissHandlers()`.

- [ ] **Step 1: Replace selector expectations with failing Appearance tests**

Update `tests/theme-selector.test.tsx` to assert:

```tsx
expect(markup).toContain('aria-label="Choose appearance"');
expect(markup).toContain('aria-label="Mode"');
expect(markup).toContain('aria-label="Color"');
expect(markup).toContain("System");
expect(markup).toContain("Light");
expect(markup).toContain("Dark");
expect(markup).not.toContain("Choose the appearance");
```

Add direct option tests:

```tsx
const modeMarkup = renderToStaticMarkup(createElement(ModeOptions, {
  selectedMode: "system",
  onSelect: vi.fn(),
}));
expect(modeMarkup).toMatch(/<input(?=[^>]*name="wikios-theme-mode")(?=[^>]*value="system")(?=[^>]*checked)/u);

const colorMarkup = renderToStaticMarkup(createElement(ThemeOptions, {
  selectedTheme: "blue",
  resolvedMode: "dark",
  onSelect: vi.fn(),
}));
expect(colorMarkup).toContain("#111b2a");
expect(colorMarkup).toContain("#7eb5ef");
expect(colorMarkup).toContain("#192333");
```

Rewrite the stateful interaction test so selecting Dark and Violet leaves the
dialog in `is-open`, keeps `aria-expanded="true"`, and calls exactly:

```ts
expect(selectModePreference).toHaveBeenCalledExactlyOnceWith("dark");
expect(selectColorTheme).toHaveBeenCalledExactlyOnceWith("violet");
expect(popoverAfterSelection.props.inert).toBe(false);
expect(popoverAfterSelection.props.className).toContain("is-open");
```

- [ ] **Step 2: Run the selector test and verify it fails**

```bash
pnpm exec vitest run tests/theme-selector.test.tsx
```

Expected: FAIL on the old label, missing mode options, tuple previews, and
close-after-selection behavior.

- [ ] **Step 3: Implement the Appearance panel**

Import `Monitor`, `Sun`, and `Moon` from Lucide. Add:

```ts
export const THEME_MODE_OPTIONS = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
] as const;
```

`ModeOptions` renders a `<div role="radiogroup" aria-label="Mode">` with three
same-name native radios (`wikios-theme-mode`). `ThemeOptions` changes its group
label to `Color`, accepts `resolvedMode`, and maps
`theme.preview[resolvedMode]`.

Change the trigger and dialog labels to “Choose appearance” and the panel title
to “Appearance”. Under the title render exactly two sections:

```tsx
<section className="theme-selector-section">
  <p className="theme-selector-label">Mode</p>
  <ModeOptions selectedMode={modePreference} onSelect={selectModePreference} />
</section>
<section className="theme-selector-section">
  <p className="theme-selector-label">Color</p>
  <ThemeOptions selectedTheme={colorTheme} resolvedMode={resolvedMode} onSelect={selectColorTheme} />
</section>
```

Selection handlers must not call `setState("closing")` or focus the trigger.
The existing trigger, outside pointer, and Escape paths remain responsible for
closing.

Add compact `.theme-mode-options` and `.theme-mode-option` styles using existing
surface, border, ink, accent-soft, accent, and focus tokens. Keep each mode
target at least 44px high, maintain the trigger's `2.75rem` minimum width, and
do not add descriptive copy.

- [ ] **Step 4: Run selector and accessibility-focused tests**

```bash
pnpm exec vitest run tests/theme-selector.test.tsx tests/unified-color-system.test.ts
pnpm typecheck
```

Expected: tests PASS with two named radiogroups and open-after-selection behavior.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/theme-selector.tsx src/client/globals.css tests/theme-selector.test.tsx
git commit -m "feat: add appearance mode selector"
```

---

### Task 4: Define the three dark palettes and eliminate light-only chrome

**Files:**
- Modify: `src/client/globals.css`
- Modify: `src/client/routes/explorer-route.tsx`
- Modify: `tests/unified-color-system.test.ts`
- Create: `tests/dark-theme-contrast.test.ts`

**Interfaces:**
- Produces: complete semantic tokens for every color/mode pair.
- Produces: canvas tokens consumed by Task 5 and Mermaid tokens consumed by Task 6.
- Preserves: all existing light-token values byte-for-byte.

- [ ] **Step 1: Write failing six-palette completeness and stale-chrome tests**

Refactor `tests/unified-color-system.test.ts` with a helper that extracts an
exact combined selector block:

```ts
function themeBlock(styles: string, color: "teal" | "blue" | "violet", mode: "light" | "dark") {
  const selector = `:root[data-color-theme="${color}"][data-mode="${mode}"]`;
  const start = styles.indexOf(selector);
  const end = styles.indexOf("\n}", start);
  expect(start, selector).toBeGreaterThan(-1);
  return styles.slice(start, end);
}
```

For every one of the six combinations, require all current `brand-*` and
`graph-*` tokens plus:

```ts
[
  "brand-shadow-soft", "brand-shadow-strong",
  "mini-graph-edge", "mini-graph-edge-hover",
  "mini-graph-label", "mini-graph-label-muted",
  "mermaid-background", "mermaid-primary", "mermaid-primary-text",
  "mermaid-primary-border", "mermaid-line", "mermaid-secondary", "mermaid-tertiary",
]
```

Keep exact assertions for the current three light `brand-muted-surface` values,
Berry values, and graph hex values. Add assertions that:

```ts
expect(styles).toContain(':root[data-mode="light"] {\n  color-scheme: light;');
expect(styles).toContain(':root[data-mode="dark"] {\n  color-scheme: dark;');
expect(styles).not.toMatch(/^html\s*\{[^}]*color-scheme:/msu);
expect(explorerSource).not.toContain("rgba(24,30,36,0.08)");
expect(explorerSource).toContain("var(--brand-shadow-soft)");
```

- [ ] **Step 2: Write the failing contrast matrix test**

Create `tests/dark-theme-contrast.test.ts`. Extract opaque `oklch(L C H)` and
hex values from each combined CSS block. Convert OKLCH to linear sRGB using:

```ts
const a = chroma * Math.cos((hue * Math.PI) / 180);
const b = chroma * Math.sin((hue * Math.PI) / 180);
const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
const l = lPrime ** 3;
const m = mPrime ** 3;
const s = sPrime ** 3;
const linear = [
  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
].map((channel) => Math.min(1, Math.max(0, channel)));
```

Compute WCAG relative luminance as
`0.2126 * r + 0.7152 * g + 0.0722 * b` from linear channels and contrast as
`(lighter + 0.05) / (darker + 0.05)`. Assert these pairs for all six palettes:

```ts
const textPairs = [
  ["brand-ink", "brand-canvas"],
  ["brand-ink", "brand-surface"],
  ["brand-muted-ink", "brand-surface"],
  ["brand-on-deep", "brand-deep"],
  ["brand-on-deep-muted", "brand-deep"],
  ["brand-accent", "brand-surface"],
] as const;
for (const pair of textPairs) expect(contrast(pair), pair.join(" / ")).toBeGreaterThanOrEqual(4.5);

const uiPairs = [
  ["brand-control-border", "brand-surface"],
  ["brand-deep-control-border", "brand-deep"],
  ["brand-focus", "brand-canvas"],
] as const;
for (const pair of uiPairs) expect(contrast(pair), pair.join(" / ")).toBeGreaterThanOrEqual(3);
```

Use `brand-accent` as the `brand-focus` source when extracting the pair.

- [ ] **Step 3: Run the color tests and verify they fail**

```bash
pnpm exec vitest run tests/unified-color-system.test.ts tests/dark-theme-contrast.test.ts
```

Expected: FAIL because combined selectors and dark tokens do not exist.

- [ ] **Step 4: Split light and dark palette selectors**

Change each current theme selector from
`:root[data-color-theme="<color>"]` to
`:root[data-color-theme="<color>"][data-mode="light"]` without changing any
existing declaration value. Add the missing shadow, mini-graph, and Mermaid hex
tokens to the light blocks:

```css
--brand-shadow-soft: rgb(21 19 26 / 0.08);
--brand-shadow-strong: rgb(21 19 26 / 0.32);
--mini-graph-edge: rgb(16 34 39 / 0.08);
--mini-graph-edge-hover: rgb(16 34 39 / 0.18);
--mini-graph-label: rgb(16 34 39 / 0.78);
--mini-graph-label-muted: rgb(16 34 39 / 0.58);
```

Set the seven Mermaid tokens in each light block to these exact values:

| Token | Teal Light | Blue Light | Violet Light |
|---|---|---|---|
| `mermaid-background` | `#ebf6f7` | `#eef4fb` | `#f4f2fb` |
| `mermaid-primary` | `#dceff1` | `#dfeaf7` | `#e8e3f6` |
| `mermaid-primary-text` | `#102227` | `#15202d` | `#201c2c` |
| `mermaid-primary-border` | `#93a9ac` | `#8494a8` | `#938ea6` |
| `mermaid-line` | `#5a787b` | `#667d94` | `#7c7690` |
| `mermaid-secondary` | `#e5f1f2` | `#e6eef8` | `#ece8f7` |
| `mermaid-tertiary` | `#d9ecee` | `#dce7f5` | `#e4def3` |

- [ ] **Step 5: Add the exact dark token matrix**

Create three combined dark blocks. Use these values as the initial complete
matrix; adjust only a failing foreground/border lightness during Step 7 while
retaining each hue and hierarchy:

| Token | Teal Dark | Blue Dark | Violet Dark |
|---|---|---|---|
| `brand-deep` | `oklch(0.27 0.045 205)` | `oklch(0.27 0.055 250)` | `oklch(0.27 0.052 295)` |
| `brand-deep-hover` | `oklch(0.34 0.055 205)` | `oklch(0.34 0.068 250)` | `oklch(0.34 0.064 295)` |
| `brand-on-deep` | `oklch(0.95 0.012 205)` | `oklch(0.95 0.012 250)` | `oklch(0.95 0.012 295)` |
| `brand-on-deep-muted` | `oklch(0.76 0.024 205)` | `oklch(0.76 0.024 250)` | `oklch(0.76 0.024 295)` |
| `brand-on-deep-accent` | `oklch(0.79 0.095 190)` | `oklch(0.79 0.095 235)` | `oklch(0.79 0.09 310)` |
| `brand-deep-border` | `oklch(0.43 0.045 205)` | `oklch(0.43 0.055 250)` | `oklch(0.43 0.052 295)` |
| `brand-deep-control-border` | `oklch(0.58 0.04 205)` | `oklch(0.58 0.045 250)` | `oklch(0.58 0.043 295)` |
| `brand-deep-control` | `oklch(0.34 0.045 205)` | `oklch(0.34 0.055 250)` | `oklch(0.34 0.052 295)` |
| `brand-canvas` | `oklch(0.155 0.015 205)` | `oklch(0.155 0.018 250)` | `oklch(0.155 0.018 295)` |
| `brand-surface` | `oklch(0.195 0.017 205)` | `oklch(0.195 0.021 250)` | `oklch(0.195 0.021 295)` |
| `brand-surface-subtle` | `oklch(0.235 0.022 205)` | `oklch(0.235 0.027 250)` | `oklch(0.235 0.027 295)` |
| `brand-muted-surface` | `oklch(0.255 0.02 205)` | `oklch(0.255 0.025 250)` | `oklch(0.255 0.025 295)` |
| `brand-ink` | `oklch(0.93 0.012 205)` | `oklch(0.93 0.014 250)` | `oklch(0.93 0.014 295)` |
| `brand-muted-ink` | `oklch(0.72 0.024 205)` | `oklch(0.72 0.028 250)` | `oklch(0.72 0.028 295)` |
| `brand-accent` | `oklch(0.72 0.1 205)` | `oklch(0.72 0.12 250)` | `oklch(0.72 0.115 295)` |
| `brand-accent-soft` | `oklch(0.27 0.04 205)` | `oklch(0.27 0.05 250)` | `oklch(0.27 0.048 295)` |
| `brand-border` | `oklch(0.34 0.025 205)` | `oklch(0.34 0.03 250)` | `oklch(0.34 0.03 295)` |
| `brand-control-border` | `oklch(0.5 0.035 205)` | `oklch(0.5 0.042 250)` | `oklch(0.5 0.04 295)` |
| `brand-focus-soft` | `oklch(0.72 0.1 205 / 0.3)` | `oklch(0.72 0.12 250 / 0.3)` | `oklch(0.72 0.115 295 / 0.3)` |
| `brand-skeleton` | `oklch(0.29 0.02 205)` | `oklch(0.29 0.025 250)` | `oklch(0.29 0.025 295)` |
| `brand-scrollbar` | `oklch(0.5 0.035 205)` | `oklch(0.5 0.042 250)` | `oklch(0.5 0.04 295)` |
| `brand-overlay` | `oklch(0.08 0.01 205 / 0.68)` | `oklch(0.08 0.01 250 / 0.68)` | `oklch(0.08 0.01 295 / 0.68)` |
| `graph-background` | `#142426` | `#141d2b` | `#201a2b` |
| `graph-foreground` | `#edf7f7` | `#eef4fb` | `#f5f1fb` |
| `graph-muted` | `#a7babb` | `#a9b5c7` | `#b9b1c9` |
| `graph-node-default` | `#72c1c8` | `#7eb5ef` | `#ad98e5` |
| `graph-node-muted` | `#557174` | `#596a80` | `#71677e` |
| `graph-edge-default` | `#698f92` | `#6e829d` | `#887d99` |
| `graph-edge-muted` | `#3d5254` | `#3e4a5c` | `#50485d` |
| `graph-label` | `#edf7f7` | `#eef4fb` | `#f5f1fb` |

Each dark block also defines shadow and mini-canvas values. Use the matching
family foreground channels for the four translucent mini-canvas colors:

```css
--brand-shadow-soft: rgb(0 0 0 / 0.24);
--brand-shadow-strong: rgb(0 0 0 / 0.56);
/* Teal values; Blue uses 238 244 251 and Violet uses 245 241 251. */
--mini-graph-edge: rgb(238 247 247 / 0.11);
--mini-graph-edge-hover: rgb(238 247 247 / 0.24);
--mini-graph-label: rgb(238 247 247 / 0.9);
--mini-graph-label-muted: rgb(238 247 247 / 0.7);
```

Set the seven Mermaid tokens in each dark block to these exact values:

| Token | Teal Dark | Blue Dark | Violet Dark |
|---|---|---|---|
| `mermaid-background` | `#142426` | `#141d2b` | `#201a2b` |
| `mermaid-primary` | `#27474b` | `#26394f` | `#3a304d` |
| `mermaid-primary-text` | `#edf7f7` | `#eef4fb` | `#f5f1fb` |
| `mermaid-primary-border` | `#52767a` | `#586f8d` | `#74648a` |
| `mermaid-line` | `#698f92` | `#6e829d` | `#887d99` |
| `mermaid-secondary` | `#20383b` | `#202f43` | `#30273f` |
| `mermaid-tertiary` | `#1a3033` | `#19283a` | `#292134` |

- [ ] **Step 6: Split mode-dependent shared semantic tokens and shadows**

Move current Berry, success, warning, error, graph relationship, and graph shadow
values into `:root[data-mode="light"]`. Add:

```css
:root[data-mode="dark"] {
  color-scheme: dark;
  --brand-secondary-accent: oklch(0.74 0.14 345);
  --brand-secondary-accent-soft: oklch(0.27 0.045 345);
  --brand-success: oklch(0.72 0.12 150);
  --brand-success-soft: oklch(0.25 0.04 150);
  --brand-error: oklch(0.75 0.14 35);
  --brand-error-soft: oklch(0.25 0.045 35);
  --brand-warning: oklch(0.78 0.13 75);
  --brand-warning-soft: oklch(0.26 0.045 75);
  --graph-edge-outgoing: #68c7ef;
  --graph-edge-incoming: #efb45a;
  --graph-panel-shadow: rgb(0 0 0 / 0.34);
}
```

Add `color-scheme: light` to the light mode block and remove the fixed `html`
declaration. Replace interface shadow literals in global surfaces, Mermaid/ASCII
shells, command palette, and Explorer sidebar with `--brand-shadow-soft` or
`--brand-shadow-strong`. Preserve the intentional dark code-block literals.

- [ ] **Step 7: Run contrast tests, tune only failing lightness values, and verify**

```bash
pnpm exec vitest run tests/unified-color-system.test.ts tests/dark-theme-contrast.test.ts
pnpm typecheck
```

Expected: all six blocks are complete, every contrast assertion passes, light
token assertions remain unchanged, and no audited light-only shadow remains.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/client/globals.css src/client/routes/explorer-route.tsx tests/unified-color-system.test.ts tests/dark-theme-contrast.test.ts
git commit -m "feat: add tinted dark palettes"
```

---

### Task 5: Recolor Sigma and the reader neighborhood canvas in place

**Files:**
- Modify: `src/client/graph-overview-model.ts`
- Modify: `src/client/routes/graph-route.tsx`
- Modify: `src/components/note-viewer.tsx`
- Modify: `tests/graph-overview-model.test.ts`
- Modify: `tests/shared-note-viewer.test.ts`

**Interfaces:**
- Consumes: `ResolvedThemeMode`, `useAppearance()`, `useResolvedThemeMode()`, and Task 4 renderer tokens.
- Produces: `adaptGraphCategoryColor(color, mode)`.
- Changes: `applyGraphThemeColors(graph, aliases, colors, resolvedMode)` and `updateGraphThemeInPlace(..., resolvedMode)`.

- [ ] **Step 1: Write failing mode-aware graph color tests**

Add to `tests/graph-overview-model.test.ts`:

```ts
expect(adaptGraphCategoryColor("#85b9c9", "light")).toBe("#5d8091");
expect(adaptGraphCategoryColor("#85b9c9", "dark")).toBe("#a2cad6");
expect(adaptGraphCategoryColor("oklch(60% 0.2 200)", "dark")).toBe("oklch(60% 0.2 200)");
```

Update existing `applyGraphThemeColors` and `updateGraphThemeInPlace` calls to
pass `"light"`, then add a second in-place call with `"dark"`. Assert the same
graph, Sigma, coordinates, and camera survive while exact category colors,
`setSettings`, and `refresh` update.

Add source-structure assertions that the Sigma construction effect dependencies
remain `[config.categories.aliases, data]` and the appearance effect dependencies
contain `[colorTheme, resolvedMode, config.categories.aliases]`.

- [ ] **Step 2: Write failing neighborhood-canvas token tests**

Add to `tests/shared-note-viewer.test.ts` source assertions that the draw effect:

```ts
expect(source).toContain("useResolvedThemeMode()");
expect(source).toContain('getPropertyValue("--mini-graph-edge")');
expect(source).toContain('getPropertyValue("--mini-graph-edge-hover")');
expect(source).toContain('getPropertyValue("--mini-graph-label")');
expect(source).toContain('getPropertyValue("--mini-graph-label-muted")');
expect(source).not.toContain('"rgba(0,0,0,0.15)"');
expect(source).not.toContain('"rgba(0,0,0,0.7)"');
```

- [ ] **Step 3: Run focused graph/reader tests and verify they fail**

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts tests/shared-note-viewer.test.ts
```

Expected: FAIL on the missing mode adapter, signatures, effect dependency, and
canvas token reads.

- [ ] **Step 4: Implement mode-aware category adaptation**

Keep `strengthenGraphColor()` unchanged for light compatibility. Add:

```ts
const GRAPH_PAPER_RGB = [238, 244, 247] as const;
const GRAPH_DARK_COLOR_MIX = 0.28;

export function adaptGraphCategoryColor(color: string, mode: ResolvedThemeMode) {
  if (mode === "light") return strengthenGraphColor(color);
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color.trim());
  if (!match) return color;
  const source = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  const mixed = source.map((channel, index) =>
    Math.round(channel * (1 - GRAPH_DARK_COLOR_MIX) + GRAPH_PAPER_RGB[index] * GRAPH_DARK_COLOR_MIX),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
```

Pass `resolvedMode` through category lookup, `applyGraphThemeColors`, and
`updateGraphThemeInPlace`. In `Component`, read it from `useAppearance()` and
add it only to the lightweight appearance effect. Do not add it to the
construction/layout effect.

- [ ] **Step 5: Replace neighborhood canvas light literals with tokens**

Read `resolvedMode` through `useResolvedThemeMode()` so a System change rerenders
the canvas component. At the top of `draw()`, read the six canvas-safe values:

```ts
const styles = getComputedStyle(canvas);
const canvasColor = styles.getPropertyValue("--brand-canvas").trim();
const defaultNodeColor = styles.getPropertyValue("--graph-node-default").trim();
const edgeColor = styles.getPropertyValue("--mini-graph-edge").trim();
const edgeHoverColor = styles.getPropertyValue("--mini-graph-edge-hover").trim();
const labelColor = styles.getPropertyValue("--mini-graph-label").trim();
const labelMutedColor = styles.getPropertyValue("--mini-graph-label-muted").trim();
```

Pass `defaultNodeColor` and `resolvedMode` into `miniColor()` so uncategorized
nodes use the active graph default and configured hex category colors use
`adaptGraphCategoryColor()`. Use the edge and label tokens instead of black
RGBA literals. Include `resolvedMode` in the draw effect dependency array.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts tests/shared-note-viewer.test.ts
pnpm typecheck
```

Expected: tests PASS; Sigma lifecycle source assertions remain intact.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/client/graph-overview-model.ts src/client/routes/graph-route.tsx src/components/note-viewer.tsx tests/graph-overview-model.test.ts tests/shared-note-viewer.test.ts
git commit -m "feat: recolor graphs for dark themes"
```

---

### Task 6: Rerender Mermaid diagrams with the resolved mode

**Files:**
- Create: `src/client/mermaid-theme.ts`
- Modify: `src/components/note-viewer.tsx`
- Modify: `tests/shared-note-viewer.test.ts`
- Create: `tests/mermaid-theme.test.ts`

**Interfaces:**
- Consumes: `ResolvedThemeMode`, `useResolvedThemeMode()`, and Task 4 Mermaid tokens.
- Produces: `MermaidThemeColors`, `readMermaidThemeColors()`, `getMermaidConfig()`, and `renderMermaidDiagram()`.

- [ ] **Step 1: Write failing Mermaid configuration tests**

Create `tests/mermaid-theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMermaidConfig } from "../src/client/mermaid-theme";

const colors = {
  background: "#142426",
  primary: "#27474b",
  primaryText: "#edf7f7",
  primaryBorder: "#52767a",
  line: "#698f92",
  secondary: "#273c3f",
  tertiary: "#203235",
};

describe("Mermaid appearance", () => {
  it("builds a strict base-theme config from active tokens", () => {
    expect(getMermaidConfig("dark", colors)).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      darkMode: true,
      themeVariables: {
        background: "#142426",
        primaryColor: "#27474b",
        primaryTextColor: "#edf7f7",
        primaryBorderColor: "#52767a",
        lineColor: "#698f92",
        secondaryColor: "#273c3f",
        tertiaryColor: "#203235",
      },
    });
  });
});
```

Extend `tests/shared-note-viewer.test.ts` source/behavior assertions:

```ts
expect(source).toContain("useResolvedThemeMode()");
expect(source).toContain("renderMermaidDiagram(codeText, renderId, resolvedMode");
expect(source).toContain("[codeText, renderId, resolvedMode]");
expect(source).not.toContain('theme: "default"');
```

- [ ] **Step 2: Run Mermaid tests and verify they fail**

```bash
pnpm exec vitest run tests/mermaid-theme.test.ts tests/shared-note-viewer.test.ts
```

Expected: FAIL because the helper and mode-dependent render path do not exist.

- [ ] **Step 3: Implement token-driven serialized Mermaid rendering**

Create `src/client/mermaid-theme.ts` with:

```ts
export interface MermaidThemeColors {
  background: string;
  primary: string;
  primaryText: string;
  primaryBorder: string;
  line: string;
  secondary: string;
  tertiary: string;
}

const tokenNames = {
  background: "--mermaid-background",
  primary: "--mermaid-primary",
  primaryText: "--mermaid-primary-text",
  primaryBorder: "--mermaid-primary-border",
  line: "--mermaid-line",
  secondary: "--mermaid-secondary",
  tertiary: "--mermaid-tertiary",
} as const;

export function readMermaidThemeColors(element: Element): MermaidThemeColors {
  const styles = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(tokenNames).map(([key, token]) => [key, styles.getPropertyValue(token).trim()]),
  ) as unknown as MermaidThemeColors;
}

export function getMermaidConfig(mode: ResolvedThemeMode, colors: MermaidThemeColors) {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    darkMode: mode === "dark",
    themeVariables: {
      background: colors.background,
      primaryColor: colors.primary,
      primaryTextColor: colors.primaryText,
      primaryBorderColor: colors.primaryBorder,
      lineColor: colors.line,
      secondaryColor: colors.secondary,
      tertiaryColor: colors.tertiary,
    },
  };
}
```

Move the dynamic Mermaid import into this module. Serialize `initialize()` plus
`render()` calls through one module-level promise chain so diagrams with
different modes cannot race through Mermaid's global configuration:

```ts
let renderQueue: Promise<void> = Promise.resolve();

export function renderMermaidDiagram(
  code: string,
  id: string,
  mode: ResolvedThemeMode,
  colors: MermaidThemeColors,
) {
  const task = renderQueue.then(async () => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize(getMermaidConfig(mode, colors));
    return mermaid.render(`note-mermaid-${id}`, code);
  });
  renderQueue = task.then(() => undefined, () => undefined);
  return task;
}
```

In `MermaidBlock`, add a container ref, read `resolvedMode`, read computed tokens
from the container, call `renderMermaidDiagram()`, and include resolved mode in
the effect dependencies. Preserve cancellation, `renderFailed`, SVG injection,
strict mode, and the source fallback.

- [ ] **Step 4: Run Mermaid/reader tests and typecheck**

```bash
pnpm exec vitest run tests/mermaid-theme.test.ts tests/shared-note-viewer.test.ts
pnpm typecheck
```

Expected: Mermaid tests PASS in both mode configuration and source lifecycle.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/client/mermaid-theme.ts src/components/note-viewer.tsx tests/mermaid-theme.test.ts tests/shared-note-viewer.test.ts
git commit -m "feat: theme Mermaid diagrams"
```

---

### Task 7: Complete regression and browser verification

**Files:**
- Modify only if verification finds a concrete defect in files already listed above.
- Record: `docs/superpowers/plans/2026-08-10-dark-color-themes.md` checkbox status after all checks pass.

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: verified six-theme release candidate with no new dependency.

- [ ] **Step 1: Run the complete automated gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: every command exits 0. If a command fails, fix the concrete defect,
rerun its focused test first, then rerun this complete gate.

- [ ] **Step 2: Verify dependency and light-palette stability**

```bash
git diff 972716d -- package.json pnpm-lock.yaml package-lock.json
git diff 972716d -- src/client/globals.css
```

Expected: no dependency changes; the three light palette declaration values are
unchanged apart from combined selectors and the newly added renderer tokens.

- [ ] **Step 3: Start the app for browser verification**

```bash
pnpm dev
```

Expected: Vite client at `http://localhost:5211/` and API at
`http://127.0.0.1:5212` without startup errors.

- [ ] **Step 4: Inspect the full route/theme matrix**

At widths 1440px and 390px, inspect these routes:

```text
/
/explorer
/graph
/stats
/wiki/<an-existing-note>
/setup
```

For each route, inspect Teal Light/Dark, Blue Light/Dark, and Violet Light/Dark.
Verify canvas, header, surfaces, text, muted text, links, borders, inputs,
selected/hover/focus states, loading/empty/error chrome, overlays, and mobile
safe-area layout. No surface may retain stale light chrome in Dark.

- [ ] **Step 5: Inspect behavioral appearance changes**

Verify in the browser:

1. With System selected, changing the OS preference updates the app live.
2. With Light or Dark selected, changing the OS preference does not change the app.
3. Reload preserves color and mode preference without a light flash.
4. The Appearance panel remains open after selecting a mode or color.
5. Escape and outside pointer close it; Escape restores trigger focus.
6. Sigma recolors without moving the camera or restarting layout.
7. The reader neighborhood canvas recolors without stale black labels/edges.
8. Mermaid diagrams rerender with readable fills, text, borders, and lines.
9. Code blocks, tables, inline code, command palette, and sidebars remain readable.

- [ ] **Step 6: Run the final automated gate after visual fixes**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit verification fixes, if any**

If Step 4 or 5 required tracked fixes:

```bash
git add src tests
git commit -m "fix: complete dark theme verification"
```

If no tracked fix was required, do not create an empty commit.

---

## Final Review Checklist

- [ ] Every approved design requirement maps to a task above.
- [ ] No placeholder or deferred implementation instruction remains.
- [ ] Public types and function signatures match across tasks.
- [ ] System preference cleanup is covered.
- [ ] Existing light palette values and config precedence are covered.
- [ ] Sigma, neighborhood canvas, and Mermaid each react to resolved mode.
- [ ] Contrast, automated checks, and the 72-view route/theme/viewport matrix are covered.
- [ ] No production dependency or redundant Appearance copy is introduced.
