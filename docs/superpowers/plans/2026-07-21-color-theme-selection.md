# Color Theme Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instantly selectable, per-browser Teal, Blue, and Violet light color themes to every WikiOS route while preserving Teal as the default and keeping installation config overrides authoritative.

**Architecture:** Apply a typed `ColorThemeId` as `data-color-theme` on the document root and let complete CSS token presets drive the existing route aliases. A React provider owns the selection and safe `localStorage` persistence; one shared selector is mounted in existing page chrome. Graph renderer colors are refreshed in place because Sigma reads renderer-safe CSS colors only when explicitly updated.

**Tech Stack:** React 19, React Router 7, TypeScript 5, Tailwind CSS 4 utilities, CSS custom properties with OKLCH, Lucide React, Graphology/Sigma, Vitest, pnpm.

## Global Constraints

- Use `pnpm` for project commands.
- Do not add a production dependency.
- Teal must remain visually unchanged and remain the fallback theme.
- The first release contains exactly `teal`, `blue`, and `violet`; do not add dark mode, system-theme detection, a custom theme builder, or cross-browser sync.
- Store the selection per browser in `localStorage`; storage failures must degrade to in-memory state without route errors.
- Apply theme choices instantly without navigation or data reloads.
- Keep `wiki-os.config.ts` CSS-variable overrides higher priority than built-in presets.
- Preserve success, warning, error, graph category, and graph relationship colors as semantic/data encodings.
- Sigma-facing colors must remain hex or RGB(A), never OKLCH.
- Preserve WCAG 2.2 AA text contrast, 3:1 interface boundaries/focus indicators, keyboard operation, and reduced-motion behavior.

---

### Task 1: Add the typed theme registry and safe persistence model

**Files:**
- Create: `src/client/color-theme.ts`
- Create: `tests/color-theme.test.ts`

**Interfaces:**
- Produces: `ColorThemeId`, `COLOR_THEMES`, `DEFAULT_COLOR_THEME`, `COLOR_THEME_STORAGE_KEY`, `parseColorThemeId()`, `readStoredColorTheme()`, `persistColorTheme()`, `applyColorTheme()`, `initializeBrowserColorTheme()`.
- Consumes: Browser `localStorage` and `document.documentElement` through narrow injectable interfaces.

- [ ] **Step 1: Write the failing model tests**

```ts
import { describe, expect, it, vi } from "vitest";

import {
  COLOR_THEMES,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  applyColorTheme,
  initializeBrowserColorTheme,
  parseColorThemeId,
  persistColorTheme,
  readStoredColorTheme,
} from "../src/client/color-theme";

describe("color theme model", () => {
  it("publishes the exact supported catalog and falls back to Teal", () => {
    expect(COLOR_THEMES.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "teal", label: "Teal" },
      { id: "blue", label: "Blue" },
      { id: "violet", label: "Violet" },
    ]);
    expect(DEFAULT_COLOR_THEME).toBe("teal");
    expect(parseColorThemeId("blue")).toBe("blue");
    expect(parseColorThemeId("unknown")).toBe("teal");
    expect(parseColorThemeId(null)).toBe("teal");
  });

  it("reads and writes storage without allowing storage errors to escape", () => {
    const storage = { getItem: vi.fn(() => "violet"), setItem: vi.fn() };
    expect(readStoredColorTheme(storage)).toBe("violet");
    expect(persistColorTheme(storage, "blue")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY, "blue");

    expect(readStoredColorTheme({ getItem: () => { throw new Error("blocked"); } })).toBe("teal");
    expect(persistColorTheme({ setItem: () => { throw new Error("quota"); } }, "violet")).toBe(false);
  });

  it("applies the selected ID and initializes storage before rendering", () => {
    const root = { setAttribute: vi.fn() };
    applyColorTheme(root, "blue");
    expect(root.setAttribute).toHaveBeenCalledWith("data-color-theme", "blue");

    root.setAttribute.mockClear();
    expect(initializeBrowserColorTheme(root, { getItem: () => "violet" })).toBe("violet");
    expect(root.setAttribute).toHaveBeenCalledWith("data-color-theme", "violet");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `pnpm exec vitest run tests/color-theme.test.ts`

Expected: FAIL because `../src/client/color-theme` does not exist.

- [ ] **Step 3: Implement the complete theme model**

```ts
export const COLOR_THEME_IDS = ["teal", "blue", "violet"] as const;
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

export interface ColorThemeDefinition {
  readonly id: ColorThemeId;
  readonly label: string;
  readonly preview: readonly [deep: string, accent: string, canvas: string];
}

export const COLOR_THEMES: readonly ColorThemeDefinition[] = [
  { id: "teal", label: "Teal", preview: ["#004950", "#00626c", "#ebf6f7"] },
  { id: "blue", label: "Blue", preview: ["#12426d", "#1a588f", "#eef4fb"] },
  { id: "violet", label: "Violet", preview: ["#433567", "#5a4789", "#f4f2fb"] },
] as const;

export const DEFAULT_COLOR_THEME: ColorThemeId = "teal";
export const COLOR_THEME_STORAGE_KEY = "wikios:color-theme";

interface ThemeStorageReader { getItem(key: string): string | null; }
interface ThemeStorageWriter { setItem(key: string, value: string): void; }
interface ThemeRoot { setAttribute(name: string, value: string): void; }

export function parseColorThemeId(value: string | null): ColorThemeId {
  return COLOR_THEME_IDS.includes(value as ColorThemeId)
    ? (value as ColorThemeId)
    : DEFAULT_COLOR_THEME;
}

export function readStoredColorTheme(storage: ThemeStorageReader | null): ColorThemeId {
  if (!storage) return DEFAULT_COLOR_THEME;
  try { return parseColorThemeId(storage.getItem(COLOR_THEME_STORAGE_KEY)); }
  catch { return DEFAULT_COLOR_THEME; }
}

export function persistColorTheme(
  storage: ThemeStorageWriter | null,
  theme: ColorThemeId,
): boolean {
  if (!storage) return false;
  try { storage.setItem(COLOR_THEME_STORAGE_KEY, theme); return true; }
  catch { return false; }
}

export function applyColorTheme(root: ThemeRoot, theme: ColorThemeId) {
  root.setAttribute("data-color-theme", theme);
}

export function browserThemeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; }
  catch { return null; }
}

export function initializeBrowserColorTheme(
  root: ThemeRoot = document.documentElement,
  storage: ThemeStorageReader | null = browserThemeStorage(),
): ColorThemeId {
  const theme = readStoredColorTheme(storage);
  applyColorTheme(root, theme);
  return theme;
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `pnpm exec vitest run tests/color-theme.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```bash
git add src/client/color-theme.ts tests/color-theme.test.ts
git commit -m "feat: add color theme model"
```

---

### Task 2: Add the provider and bootstrap theme before routed rendering

**Files:**
- Create: `src/client/color-theme-provider.tsx`
- Create: `tests/color-theme-provider.test.tsx`
- Modify: `src/client/main.tsx:1-35`

**Interfaces:**
- Consumes: `ColorThemeId`, `applyColorTheme()`, `browserThemeStorage()`, `persistColorTheme()`, `initializeBrowserColorTheme()` from Task 1.
- Produces: `ColorThemeProvider` and `useColorTheme()` returning `{ colorTheme, selectColorTheme }`.

- [ ] **Step 1: Write provider and bootstrap contract tests**

```tsx
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColorThemeProvider, useColorTheme } from "../src/client/color-theme-provider";

function Probe() {
  const { colorTheme } = useColorTheme();
  return createElement("span", { "data-theme": colorTheme }, colorTheme);
}

describe("color theme provider", () => {
  it("provides the initialized theme to descendants", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorThemeProvider, { initialTheme: "violet" }, createElement(Probe)),
    );
    expect(markup).toContain('data-theme="violet"');
  });

  it("initializes the root theme before config overrides and React rendering", () => {
    const main = readFileSync(fileURLToPath(new URL("../src/client/main.tsx", import.meta.url)), "utf8");
    const initialize = main.indexOf("initializeBrowserColorTheme()");
    const configOverrides = main.indexOf("applyThemeVariables(config)");
    const render = main.indexOf("createRoot(rootContainer).render");
    expect(initialize).toBeGreaterThan(-1);
    expect(initialize).toBeLessThan(configOverrides);
    expect(configOverrides).toBeLessThan(render);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm exec vitest run tests/color-theme-provider.test.tsx`

Expected: FAIL because the provider and bootstrap call do not exist.

- [ ] **Step 3: Implement the provider**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  applyColorTheme,
  browserThemeStorage,
  persistColorTheme,
  type ColorThemeId,
} from "./color-theme";

interface ColorThemeContextValue {
  colorTheme: ColorThemeId;
  selectColorTheme(theme: ColorThemeId): void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

export function ColorThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: ColorThemeId;
}) {
  const [colorTheme, setColorTheme] = useState(initialTheme);
  const selectColorTheme = useCallback((theme: ColorThemeId) => {
    applyColorTheme(document.documentElement, theme);
    persistColorTheme(browserThemeStorage(), theme);
    setColorTheme(theme);
  }, []);
  const value = useMemo(() => ({ colorTheme, selectColorTheme }), [colorTheme, selectColorTheme]);
  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme() {
  const value = useContext(ColorThemeContext);
  if (!value) throw new Error("useColorTheme must be used inside ColorThemeProvider");
  return value;
}
```

- [ ] **Step 4: Wire synchronous initialization and provider ordering in `main.tsx`**

```tsx
import { ColorThemeProvider } from "@/client/color-theme-provider";
import { initializeBrowserColorTheme } from "@/client/color-theme";

const initialColorTheme = initializeBrowserColorTheme();

// Keep applyThemeVariables(config) before render so inline installation overrides win.
createRoot(rootContainer).render(
  <StrictMode>
    <WikiConfigProvider config={config}>
      <ColorThemeProvider initialTheme={initialColorTheme}>
        <RouterProvider router={router} />
      </ColorThemeProvider>
    </WikiConfigProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm exec vitest run tests/color-theme.test.ts tests/color-theme-provider.test.tsx && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the provider and bootstrap**

```bash
git add src/client/color-theme-provider.tsx src/client/main.tsx tests/color-theme-provider.test.tsx
git commit -m "feat: provide persisted color themes"
```

---

### Task 3: Convert the teal palette into three generic CSS token presets

**Files:**
- Modify: `src/client/globals.css:7-103, 438-527, 931-942`
- Modify: `tests/unified-color-system.test.ts:9-22, 86-104`

**Interfaces:**
- Consumes: root `data-color-theme` from Tasks 1-2.
- Produces: complete `teal`, `blue`, and `violet` token blocks; generic `--brand-deep` and `--brand-deep-hover` names; renderer-safe Graph colors.

- [ ] **Step 1: Replace the first unified-color test with a failing three-theme contract**

```ts
it("defines complete Teal, Blue, and Violet token presets", () => {
  const styles = source("../src/client/globals.css");
  const required = [
    "brand-deep", "brand-deep-hover", "brand-canvas", "brand-surface",
    "brand-ink", "brand-muted-ink", "brand-accent", "brand-accent-soft",
    "brand-border", "brand-control-border", "graph-background",
    "graph-foreground", "graph-node-default", "graph-edge-default", "graph-label",
  ];
  for (const id of ["teal", "blue", "violet"]) {
    const start = styles.indexOf(`:root[data-color-theme="${id}"]`);
    const end = styles.indexOf("\n}", start);
    const block = styles.slice(start, end);
    expect(start, id).toBeGreaterThan(-1);
    for (const token of required) expect(block, `${id}:${token}`).toContain(`--${token}:`);
  }
  expect(styles).not.toContain("--brand-deep-teal");
  expect(styles).not.toContain("--brand-deep-teal-hover");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts`

Expected: FAIL because Blue/Violet blocks and generic deep-token names do not exist.

- [ ] **Step 3: Replace the current theme-specific portion of `:root` with exact preset blocks**

```css
:root[data-color-theme="teal"] {
  --brand-deep: oklch(0.37 0.065 205);
  --brand-deep-hover: oklch(0.43 0.07 205);
  --brand-on-deep: oklch(0.97 0.012 205);
  --brand-on-deep-muted: oklch(0.83 0.025 205);
  --brand-on-deep-accent: oklch(0.88 0.085 190);
  --brand-deep-border: oklch(0.5 0.055 205);
  --brand-deep-control-border: oklch(0.71 0.04 205);
  --brand-deep-control: oklch(0.43 0.05 205);
  --brand-canvas: oklch(0.965 0.012 205);
  --brand-surface: oklch(0.99 0.005 205);
  --brand-surface-subtle: oklch(0.94 0.02 205);
  --brand-ink: oklch(0.24 0.025 215);
  --brand-muted-ink: oklch(0.46 0.025 215);
  --brand-accent: oklch(0.45 0.085 205);
  --brand-accent-soft: oklch(0.91 0.035 205);
  --brand-border: oklch(0.85 0.018 205);
  --brand-control-border: oklch(0.635 0.03 205);
  --brand-focus-soft: oklch(0.45 0.085 205 / 0.2);
  --brand-skeleton: oklch(0.89 0.015 205);
  --brand-scrollbar: oklch(0.58 0.035 205);
  --brand-overlay: oklch(0.24 0.025 215 / 0.32);
  --graph-background: #ebf6f7;
  --graph-foreground: #102227;
  --graph-muted: #485c61;
  --graph-node-default: #3a6c72;
  --graph-node-muted: #93a9ac;
  --graph-edge-default: #5a787b;
  --graph-edge-muted: #a9bbbd;
  --graph-label: #102227;
}

:root[data-color-theme="blue"] {
  --brand-deep: oklch(0.37 0.09 250);
  --brand-deep-hover: oklch(0.43 0.095 250);
  --brand-on-deep: oklch(0.97 0.012 250);
  --brand-on-deep-muted: oklch(0.83 0.025 250);
  --brand-on-deep-accent: oklch(0.88 0.085 235);
  --brand-deep-border: oklch(0.5 0.07 250);
  --brand-deep-control-border: oklch(0.71 0.04 250);
  --brand-deep-control: oklch(0.43 0.065 250);
  --brand-canvas: oklch(0.965 0.012 250);
  --brand-surface: oklch(0.99 0.005 250);
  --brand-surface-subtle: oklch(0.94 0.02 250);
  --brand-ink: oklch(0.24 0.03 255);
  --brand-muted-ink: oklch(0.46 0.03 255);
  --brand-accent: oklch(0.45 0.11 250);
  --brand-accent-soft: oklch(0.91 0.035 250);
  --brand-border: oklch(0.85 0.018 250);
  --brand-control-border: oklch(0.635 0.04 250);
  --brand-focus-soft: oklch(0.45 0.11 250 / 0.2);
  --brand-skeleton: oklch(0.89 0.015 250);
  --brand-scrollbar: oklch(0.58 0.045 250);
  --brand-overlay: oklch(0.24 0.03 255 / 0.32);
  --graph-background: #eef4fb;
  --graph-foreground: #15202d;
  --graph-muted: #4d5969;
  --graph-node-default: #234566;
  --graph-node-muted: #8494a8;
  --graph-edge-default: #667d94;
  --graph-edge-muted: #93a0ae;
  --graph-label: #15202d;
}

:root[data-color-theme="violet"] {
  --brand-deep: oklch(0.37 0.085 295);
  --brand-deep-hover: oklch(0.43 0.09 295);
  --brand-on-deep: oklch(0.97 0.012 295);
  --brand-on-deep-muted: oklch(0.83 0.025 295);
  --brand-on-deep-accent: oklch(0.88 0.08 310);
  --brand-deep-border: oklch(0.5 0.065 295);
  --brand-deep-control-border: oklch(0.71 0.04 295);
  --brand-deep-control: oklch(0.43 0.06 295);
  --brand-canvas: oklch(0.965 0.012 295);
  --brand-surface: oklch(0.99 0.005 295);
  --brand-surface-subtle: oklch(0.94 0.02 295);
  --brand-ink: oklch(0.24 0.03 295);
  --brand-muted-ink: oklch(0.46 0.03 295);
  --brand-accent: oklch(0.45 0.105 295);
  --brand-accent-soft: oklch(0.91 0.035 295);
  --brand-border: oklch(0.85 0.018 295);
  --brand-control-border: oklch(0.635 0.04 295);
  --brand-focus-soft: oklch(0.45 0.105 295 / 0.2);
  --brand-skeleton: oklch(0.89 0.015 295);
  --brand-scrollbar: oklch(0.58 0.04 295);
  --brand-overlay: oklch(0.24 0.03 295 / 0.32);
  --graph-background: #f4f2fb;
  --graph-foreground: #201c2c;
  --graph-muted: #595567;
  --graph-node-default: #453b61;
  --graph-node-muted: #938ea6;
  --graph-edge-default: #7c7690;
  --graph-edge-muted: #9f9cad;
  --graph-label: #201c2c;
}
```

Keep a default before JavaScript by setting `data-color-theme="teal"` on the `<html>` element in `index.html`. Preserve shared semantic and relationship tokens in the common `:root` block.

- [ ] **Step 4: Generalize aliases and eliminate fixed teal descendants**

Perform these exact replacements throughout `globals.css` and its source assertions:

```text
--brand-deep-teal-hover -> --brand-deep-hover
--brand-deep-teal       -> --brand-deep
oklch(0.93 0.018 205)   -> var(--brand-surface-subtle)
oklch(0.89 0.015 205)   -> var(--brand-skeleton)
oklch(0.94 0.02 205)    -> var(--brand-surface-subtle)
oklch(0.58 0.035 205)   -> var(--brand-scrollbar)
oklch(0.24 0.025 215 / 0.32) -> var(--brand-overlay)
```

Set `--ring: color-mix(in oklch, var(--brand-accent) 45%, transparent);` and keep `--graph-edge-outgoing`, `--graph-edge-incoming`, success, warning, and error tokens in the common root.

- [ ] **Step 5: Run the color-system tests**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts tests/homepage.test.tsx tests/graph-overview-model.test.ts`

Expected: PASS; every Sigma token assertion still matches hex or RGB.

- [ ] **Step 6: Commit the CSS presets**

```bash
git add index.html src/client/globals.css tests/unified-color-system.test.ts
git commit -m "feat: add blue and violet color tokens"
```

---

### Task 4: Build the accessible shared Theme selector

**Files:**
- Create: `src/components/theme-selector.tsx`
- Create: `tests/theme-selector.test.tsx`
- Modify: `src/client/globals.css` (append selector styles near shared route chrome)

**Interfaces:**
- Consumes: `COLOR_THEMES`, `ColorThemeId`, and `useColorTheme()`.
- Produces: `ThemeSelector` and the independently renderable `ThemeOptions` test seam.

- [ ] **Step 1: Write failing static accessibility tests**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ColorThemeProvider } from "../src/client/color-theme-provider";
import { ThemeOptions, ThemeSelector } from "../src/components/theme-selector";

describe("ThemeSelector", () => {
  it("renders a named trigger with popup state", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorThemeProvider, { initialTheme: "teal" }, createElement(ThemeSelector)),
    );
    expect(markup).toContain('aria-label="Choose color theme"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders all themes as a labeled radio group with explicit selected state", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeOptions, { selectedTheme: "blue", onSelect: vi.fn() }),
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("Teal");
    expect(markup).toContain("Blue");
    expect(markup).toContain("Violet");
    expect(markup).toMatch(/value="blue"[^>]*checked/);
    expect(markup).toContain("Selected");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing component failure**

Run: `pnpm exec vitest run tests/theme-selector.test.tsx`

Expected: FAIL because `ThemeSelector` does not exist.

- [ ] **Step 3: Implement `ThemeOptions` and `ThemeSelector`**

Use native same-name radio inputs so browsers supply standard arrow-key behavior. Implement the component with this complete behavior contract:

```tsx
import { Check, Palette } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useColorTheme } from "@/client/color-theme-provider";
import { COLOR_THEMES, type ColorThemeId } from "@/client/color-theme";

export function ThemeOptions({ selectedTheme, onSelect }: {
  selectedTheme: ColorThemeId;
  onSelect(theme: ColorThemeId): void;
}) {
  return (
    <div role="radiogroup" aria-label="Color theme" className="theme-options">
      {COLOR_THEMES.map((theme) => {
        const selected = theme.id === selectedTheme;
        return (
          <label key={theme.id} className="theme-option">
            <input
              className="sr-only"
              type="radio"
              name="wikios-color-theme"
              value={theme.id}
              checked={selected}
              onChange={() => onSelect(theme.id)}
            />
            <span className="theme-option-swatches" aria-hidden="true">
              {theme.preview.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
            </span>
            <span className="theme-option-label">{theme.label}</span>
            <span className="theme-option-state">
              {selected ? <><Check aria-hidden className="h-4 w-4" /><span>Selected</span></> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ThemeSelector() {
  const { colorTheme, selectColorTheme } = useColorTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="theme-selector">
      <button
        ref={triggerRef}
        type="button"
        className="app-route-header-control theme-selector-trigger"
        aria-label="Choose color theme"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette aria-hidden className="h-4 w-4" />
        <span className="hidden lg:inline">Theme</span>
      </button>
      {open ? (
        <div id={popoverId} role="dialog" aria-label="Choose color theme" className="theme-selector-popover">
          <p className="theme-selector-title">Color theme</p>
          <ThemeOptions selectedTheme={colorTheme} onSelect={selectColorTheme} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add exact shared selector styling**

```css
.theme-selector { position: relative; flex: none; }
.theme-selector-trigger { display: inline-flex; min-height: 2.75rem; align-items: center; gap: 0.5rem; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; font-weight: 600; }
.theme-selector-popover { position: absolute; z-index: 80; top: calc(100% + 0.5rem); right: 0; width: min(18rem, calc(100vw - 2rem)); border: 1px solid var(--brand-control-border); border-radius: 0.75rem; background: var(--brand-surface); padding: 0.75rem; color: var(--brand-ink); box-shadow: 0 18px 45px -24px var(--brand-overlay); }
.theme-selector-title { padding: 0.25rem 0.375rem 0.625rem; color: var(--brand-muted-ink); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.theme-options { display: grid; gap: 0.375rem; }
.theme-option { display: grid; min-height: 3rem; grid-template-columns: 3.75rem minmax(0, 1fr) auto; align-items: center; gap: 0.75rem; border: 1px solid transparent; border-radius: 0.625rem; padding: 0.5rem; }
.theme-option:has(input:checked) { border-color: var(--brand-control-border); background: var(--brand-accent-soft); }
.theme-option:has(input:focus-visible) { outline: 3px solid var(--brand-accent); outline-offset: 2px; }
.theme-option-swatches { display: grid; height: 1.75rem; grid-template-columns: repeat(3, 1fr); overflow: hidden; border: 1px solid var(--brand-border); border-radius: 999px; }
.theme-option-label { font-size: 0.875rem; font-weight: 650; }
.theme-option-state { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--brand-accent); font-size: 0.75rem; font-weight: 700; }
```

- [ ] **Step 5: Run focused tests, lint, and typecheck**

Run: `pnpm exec vitest run tests/theme-selector.test.tsx && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the selector**

```bash
git add src/components/theme-selector.tsx src/client/globals.css tests/theme-selector.test.tsx
git commit -m "feat: add accessible theme selector"
```

---

### Task 5: Place the shared selector in every route header

**Files:**
- Modify: `src/components/search-box.tsx:231-249`
- Modify: `src/client/routes/explorer-route.tsx:322-382`
- Modify: `src/client/routes/graph-route.tsx:1505-1551`
- Modify: `src/client/routes/stats-route.tsx:61-87`
- Modify: `src/client/routes/wiki-route.tsx:105-123`
- Modify: `src/client/routes/setup-route.tsx:200-230`
- Modify: `tests/unified-color-system.test.ts`

**Interfaces:**
- Consumes: `ThemeSelector` from Task 4.
- Produces: A discoverable selector in Home plus every full-page route header.

- [ ] **Step 1: Add a failing route-placement assertion**

```ts
it("places the shared theme selector in every page header", () => {
  const files = [
    "../src/components/search-box.tsx",
    "../src/client/routes/explorer-route.tsx",
    "../src/client/routes/graph-route.tsx",
    "../src/client/routes/stats-route.tsx",
    "../src/client/routes/wiki-route.tsx",
    "../src/client/routes/setup-route.tsx",
  ];
  for (const file of files) {
    expect(source(file), file).toContain('import { ThemeSelector } from "@/components/theme-selector"');
    expect(source(file), file).toContain("<ThemeSelector />");
  }
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts`

Expected: FAIL on the first file without `ThemeSelector`.

- [ ] **Step 3: Integrate the selector without introducing a second implementation**

Add the exact import to all six files:

```tsx
import { ThemeSelector } from "@/components/theme-selector";
```

For Home, replace the standalone indexed-note span with:

```tsx
<div className="flex shrink-0 items-center gap-2">
  <span className="text-sm tabular-nums text-[var(--home-hero-muted)]">
    {totalPages.toLocaleString()} {totalPages === 1 ? "note" : "notes"} indexed
  </span>
  <ThemeSelector />
</div>
```

For Explorer, Graph, Stats, Wiki, and Setup, insert `<ThemeSelector />` as the final child of the existing right-side `flex items-center` control group. Do not add a floating control, a new route, or another popover instance outside page chrome.

- [ ] **Step 4: Run route-focused regression tests**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts tests/homepage.test.tsx tests/explorer-model.test.ts tests/setup-flow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit route placement**

```bash
git add src/components/search-box.tsx src/client/routes/explorer-route.tsx src/client/routes/graph-route.tsx src/client/routes/stats-route.tsx src/client/routes/wiki-route.tsx src/client/routes/setup-route.tsx tests/unified-color-system.test.ts
git commit -m "feat: expose themes across route headers"
```

---

### Task 6: Refresh Sigma renderer colors in place on theme changes

**Files:**
- Modify: `src/client/routes/graph-route.tsx:58-89, 168-214, 1003-1446`
- Modify: `tests/graph-overview-model.test.ts`

**Interfaces:**
- Consumes: `useColorTheme().colorTheme` and the CSS renderer tokens from Task 3.
- Produces: `applyGraphThemeColors(graph, aliases, colors)` plus an effect that updates Sigma settings without refetching Graph data or rebuilding layout.

- [ ] **Step 1: Add a failing helper test**

```ts
import Graph from "graphology";
import { applyGraphThemeColors } from "../src/client/routes/graph-route";

it("recolors neutral graph data while preserving category encodings", () => {
  const graph = new Graph();
  graph.addNode("neutral", { categories: [], color: "#000000", originalColor: "#000000" });
  graph.addNode("topic", { categories: ["design"], color: "#123456", originalColor: "#123456" });
  graph.addEdge("neutral", "topic", { color: "#000000" });
  const colors = {
    background: "#eef4fb", foreground: "#15202d", muted: "#4d5969",
    nodeDefault: "#234566", nodeMuted: "#8494a8", edgeDefault: "#667d94",
    edgeMuted: "#93a0ae", edgeOutgoing: "#00628d", edgeIncoming: "#875800",
    label: "#15202d",
  };
  applyGraphThemeColors(graph, {}, colors);
  expect(graph.getNodeAttribute("neutral", "color")).toBe("#234566");
  expect(graph.getNodeAttribute("neutral", "originalColor")).toBe("#234566");
  expect(graph.getNodeAttribute("topic", "color")).not.toBe("#234566");
  expect(graph.getEdgeAttribute(graph.edges()[0], "color")).toBe("#667d94");
});
```

- [ ] **Step 2: Run the focused test and verify the missing export failure**

Run: `pnpm exec vitest run tests/graph-overview-model.test.ts`

Expected: FAIL because `applyGraphThemeColors` is not exported.

- [ ] **Step 3: Export the theme color type and live recoloring helper**

```ts
export interface GraphThemeColors {
  background: string; foreground: string; muted: string;
  nodeDefault: string; nodeMuted: string; edgeDefault: string; edgeMuted: string;
  edgeOutgoing: string; edgeIncoming: string; label: string;
}

export function applyGraphThemeColors(
  graph: Graph,
  aliases: Record<string, TopicAliasConfig>,
  colors: GraphThemeColors,
) {
  graph.forEachNode((node, attributes) => {
    const categories = Array.isArray(attributes.categories) ? attributes.categories : [];
    const color = getCategoryColor(categories, aliases, colors.nodeDefault);
    graph.mergeNodeAttributes(node, { color, originalColor: color });
  });
  graph.forEachEdge((edge) => graph.mergeEdgeAttributes(edge, { color: colors.edgeDefault }));
}
```

- [ ] **Step 4: Make reducers read a mutable theme ref and add the live refresh effect**

At component start, add:

```ts
const { colorTheme } = useColorTheme();
const graphThemeRef = useRef<GraphThemeColors | null>(null);
```

After the initial `getGraphThemeColors(containerRef.current)`, assign `graphThemeRef.current = graphTheme`. Inside `edgeReducer` and `nodeReducer`, read `const colors = graphThemeRef.current ?? graphTheme` and replace reducer references to `graphTheme.*` with `colors.*`. Clear the ref during Sigma cleanup.

Add this effect after the Sigma setup effect:

```ts
useEffect(() => {
  const container = containerRef.current;
  const graph = graphRef.current;
  const sigma = sigmaRef.current;
  if (!container || !graph || !sigma) return;
  const colors = getGraphThemeColors(container);
  graphThemeRef.current = colors;
  applyGraphThemeColors(graph, config.categories.aliases, colors);
  sigma.setSettings({
    defaultDrawNodeLabel: createGraphLabelDrawer(colors),
    labelColor: { color: colors.label },
    defaultEdgeColor: colors.edgeDefault,
    defaultNodeColor: colors.nodeDefault,
  });
  sigma.refresh();
}, [colorTheme, config.categories.aliases]);
```

This effect must not call the loader, rebuild the Graphology instance, restart ForceAtlas, or navigate.

- [ ] **Step 5: Run Graph and theme tests**

Run: `pnpm exec vitest run tests/graph-overview-model.test.ts tests/unified-color-system.test.ts tests/color-theme.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit live Graph recoloring**

```bash
git add src/client/routes/graph-route.tsx tests/graph-overview-model.test.ts
git commit -m "feat: refresh graph colors with themes"
```

---

### Task 7: Verify contrast, interaction, and full regression safety

**Files:**
- Verify: all files changed in Tasks 1-6.
- Update only if verification finds a defect: `src/client/globals.css`, `src/components/theme-selector.tsx`, relevant focused test.

**Interfaces:**
- Consumes: the complete theme feature.
- Produces: verified build and a clean implementation branch.

- [ ] **Step 1: Run the complete automated suite in separate commands**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

Expected: every command exits 0; status lists only intentional feature changes and the pre-existing untracked `output/` directory is not staged.

- [ ] **Step 2: Verify representative palette contrast**

Calculate these pairs for all three themes using the exact OKLCH values in Task 3:

```text
on-deep / deep:        Teal 9.31:1, Blue 9.56:1, Violet 9.84:1
muted-on-deep / deep:  Teal 6.05:1, Blue 6.18:1, Violet 6.34:1
ink / canvas:          Teal 14.82:1, Blue 14.86:1, Violet 14.92:1
muted-ink / surface:   Teal 6.86:1, Blue 6.91:1, Violet 6.98:1
accent / surface:      Teal 6.88:1, Blue 7.22:1, Violet 7.52:1
control-border/surface:Teal 3.30:1, Blue 3.32:1, Violet 3.37:1
```

Expected: body text is at least 4.5:1 and required control boundaries/focus indicators are at least 3:1.

- [ ] **Step 3: Inspect all routes in all themes at desktop and compact widths**

Run the existing app with `pnpm dev`, then inspect `/`, `/explorer`, `/graph`, `/stats`, one `/wiki/*` note, and `/setup?change=1` at approximately 1440px and 390px widths. For each route, select Teal, Blue, and Violet and verify:

```text
- Selection updates immediately and survives reload.
- The popover stays open after selection.
- Escape closes and returns focus; outside click closes.
- Native radio keyboard behavior works and selected state has text/checkmark.
- Header controls do not wrap, overlap, or obscure Graph search.
- No stale teal product chrome remains in Blue or Violet.
- Success/warning/error and Graph relationship/category colors remain meaningful.
- Graph camera/layout and loaded data do not reset when only color changes.
```

- [ ] **Step 4: Commit only verification fixes, if any**

```bash
git add src/client/globals.css src/components/theme-selector.tsx src/client/routes/graph-route.tsx tests/theme-selector.test.tsx tests/graph-overview-model.test.ts tests/unified-color-system.test.ts
git commit -m "fix: resolve color theme verification findings"
```

Skip this commit when verification requires no fixes; never stage `output/`.

---

## Self-Review Results

- Spec coverage: Tasks 1-6 cover registry, safe persistence, startup ordering, config precedence, three palettes, shared selector placement, accessibility semantics, and live Graph recoloring. Task 7 covers full and visual verification.
- Placeholder scan: No unfinished markers or unspecified implementation steps remain. The conditional verification-fix commit is intentionally limited to defects proven in Task 7.
- Type consistency: The plan consistently uses `ColorThemeId`, `colorTheme`, `selectColorTheme`, `GraphThemeColors`, and `applyGraphThemeColors` across producers and consumers.
