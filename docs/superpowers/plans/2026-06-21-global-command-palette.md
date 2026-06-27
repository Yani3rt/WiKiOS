# Global Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-wide Command-K/Control-K note palette with title/path search and three persistent recently opened notes that always open in Explorer.

**Architecture:** Add a router-level `AppShell` so one component can observe every route and own the global shortcut. Store recent note slugs independently of note metadata, load the existing Explorer index when the palette first opens, and keep filtering/storage/navigation rules in a pure model that is easy to test.

**Tech Stack:** React 19, React Router 7, TypeScript, Tailwind/global CSS, Vitest, existing `/api/explorer` endpoint, browser `localStorage`.

---

## File Map

- Create `src/client/command-palette-model.ts` — pure filtering, recent-note, pathname, shortcut, and keyboard-selection helpers.
- Create `src/components/command-palette.tsx` — accessible modal UI and focus/keyboard behavior.
- Create `src/client/app-shell.tsx` — global shortcut, route observation, note-index loading, persistence, and navigation.
- Modify `src/client/router.tsx` — make existing routes children of the global shell.
- Modify `src/client/globals.css` — palette overlay, dialog, result, and motion styling.
- Create `tests/command-palette.test.ts` — model, markup, route-shell, and styling contracts.
- Modify `tests/explorer-model.test.ts` — update the route-registration assertion for nested shell routes.

No production dependency is required.

### Task 1: Pure command-palette model

**Files:**
- Create: `src/client/command-palette-model.ts`
- Create: `tests/command-palette.test.ts`

- [ ] **Step 1: Write failing tests for Recents, route recognition, shortcuts, filtering, and selection**

```ts
import { describe, expect, it } from "vitest";

import type { ExplorerPage } from "../src/lib/wiki-shared";
import {
  filterCommandPalettePages,
  getNextCommandPaletteIndex,
  isCommandPaletteShortcut,
  noteSlugFromPathname,
  parseRecentNoteSlugs,
  promoteRecentNote,
  serializeRecentNoteSlugs,
} from "../src/client/command-palette-model";

const pages: ExplorerPage[] = [
  { slug: "01 ai/Agent Config", title: "Agent Config", file: "01 ai/Agent Config.md", modifiedAt: 3 },
  { slug: "02 cheat-sheet/Git", title: "Git Commands", file: "02 cheat-sheet/Git.md", modifiedAt: 2 },
  { slug: "Inbox/TODO", title: "TODO", file: "Inbox/TODO.md", modifiedAt: 1 },
];

describe("command palette model", () => {
  it("keeps three unique recent note slugs in newest-first order", () => {
    expect(promoteRecentNote(["beta", "alpha", "gamma"], "alpha")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(promoteRecentNote(["gamma", "beta", "alpha"], "delta")).toEqual([
      "delta",
      "gamma",
      "beta",
    ]);
  });

  it("round-trips valid storage and rejects malformed storage", () => {
    const serialized = serializeRecentNoteSlugs(["alpha", "beta"]);
    expect(parseRecentNoteSlugs(serialized)).toEqual(["alpha", "beta"]);
    expect(parseRecentNoteSlugs('{"bad":true}')).toEqual([]);
    expect(parseRecentNoteSlugs("not-json")).toEqual([]);
  });

  it("recognizes encoded wiki and explorer note routes", () => {
    expect(noteSlugFromPathname("/wiki/01%20ai/Agent%20Config")).toBe("01 ai/Agent Config");
    expect(noteSlugFromPathname("/explorer/Inbox/TODO")).toBe("Inbox/TODO");
    expect(noteSlugFromPathname("/graph")).toBeNull();
  });

  it("matches titles and paths case-insensitively", () => {
    expect(filterCommandPalettePages(pages, "agent").map((page) => page.title)).toEqual([
      "Agent Config",
    ]);
    expect(filterCommandPalettePages(pages, "cheat-sheet").map((page) => page.title)).toEqual([
      "Git Commands",
    ]);
  });

  it("recognizes Command-K and Control-K without accepting unrelated modifiers", () => {
    expect(isCommandPaletteShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: false })).toBe(true);
    expect(isCommandPaletteShortcut({ key: "K", metaKey: false, ctrlKey: true, altKey: false })).toBe(true);
    expect(isCommandPaletteShortcut({ key: "k", metaKey: false, ctrlKey: false, altKey: false })).toBe(false);
    expect(isCommandPaletteShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
  });

  it("wraps arrow-key selection and ignores other keys", () => {
    expect(getNextCommandPaletteIndex("ArrowDown", 2, 3)).toBe(0);
    expect(getNextCommandPaletteIndex("ArrowUp", 0, 3)).toBe(2);
    expect(getNextCommandPaletteIndex("Enter", 0, 3)).toBeNull();
    expect(getNextCommandPaletteIndex("ArrowDown", -1, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the model does not exist**

Run: `pnpm test -- tests/command-palette.test.ts`

Expected: FAIL with an import error for `src/client/command-palette-model.ts`.

- [ ] **Step 3: Implement the pure model**

```ts
import type { ExplorerPage } from "../lib/wiki-shared";

export const COMMAND_PALETTE_RECENTS_KEY = "wiki-os:command-palette-recents";
export const COMMAND_PALETTE_RECENTS_LIMIT = 3;

interface ShortcutLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

export function promoteRecentNote(recents: readonly string[], slug: string) {
  const normalized = slug.trim();
  if (!normalized) return [...recents].slice(0, COMMAND_PALETTE_RECENTS_LIMIT);
  return [normalized, ...recents.filter((item) => item !== normalized)].slice(
    0,
    COMMAND_PALETTE_RECENTS_LIMIT,
  );
}

export function serializeRecentNoteSlugs(recents: readonly string[]) {
  return JSON.stringify(recents.slice(0, COMMAND_PALETTE_RECENTS_LIMIT));
}

export function parseRecentNoteSlugs(serialized: string | null): string[] {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    for (const item of value) {
      if (typeof item !== "string" || !item.trim() || result.includes(item)) continue;
      result.push(item);
      if (result.length === COMMAND_PALETTE_RECENTS_LIMIT) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function noteSlugFromPathname(pathname: string): string | null {
  const match = /^\/(?:wiki|explorer)\/(.+)$/u.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function filterCommandPalettePages(pages: readonly ExplorerPage[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...pages];
  return pages.filter((page) =>
    page.title.toLocaleLowerCase().includes(normalized)
    || page.file.replace(/\.md$/iu, "").toLocaleLowerCase().includes(normalized),
  );
}

export function isCommandPaletteShortcut(event: ShortcutLike) {
  return event.key.toLocaleLowerCase() === "k"
    && (event.metaKey || event.ctrlKey)
    && !event.altKey;
}

export function getNextCommandPaletteIndex(key: string, current: number, count: number) {
  if (count <= 0) return null;
  if (key === "ArrowDown") return (current + 1 + count) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  return null;
}
```

- [ ] **Step 4: Run the focused model tests**

Run: `pnpm test -- tests/command-palette.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the model and tests**

```bash
git add src/client/command-palette-model.ts tests/command-palette.test.ts
git commit -m "feat: add command palette model"
```

### Task 2: Accessible command-palette modal

**Files:**
- Create: `src/components/command-palette.tsx`
- Modify: `tests/command-palette.test.ts`

- [ ] **Step 1: Add failing server-render and helper assertions**

Add an SSR test using `renderToStaticMarkup` and `createElement` that renders an open palette with `pages`, `recentSlugs`, `status="ready"`, `onClose`, `onRetry`, and `onSelect`. Assert that the markup contains:

```ts
expect(markup).toContain('role="dialog"');
expect(markup).toContain('aria-modal="true"');
expect(markup).toContain('aria-label="Search notes"');
expect(markup).toContain("Recently opened");
expect(markup).toContain("Agent Config");
expect(markup).toContain("⌘K");
```

Also assert that `resolveCommandPalettePages(pages, ["Inbox/TODO", "missing"], "")` returns only the existing TODO note and that a non-empty query returns filtered search results instead of Recents.

- [ ] **Step 2: Run the focused test and verify the component/helper imports fail**

Run: `pnpm test -- tests/command-palette.test.ts`

Expected: FAIL because `CommandPalette` and `resolveCommandPalettePages` do not exist.

- [ ] **Step 3: Add the result-resolution helper to the model**

```ts
export function resolveCommandPalettePages(
  pages: readonly ExplorerPage[],
  recentSlugs: readonly string[],
  query: string,
) {
  if (query.trim()) return filterCommandPalettePages(pages, query);
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  return recentSlugs.flatMap((slug) => {
    const page = bySlug.get(slug);
    return page ? [page] : [];
  });
}
```

- [ ] **Step 4: Implement `CommandPalette`**

The component must:

- accept `open`, `pages`, `recentSlugs`, `status`, `onClose`, `onRetry`, and `onSelect` props;
- reset query and selection when opened;
- focus the search input on open;
- save and restore the previously focused element;
- use `resolveCommandPalettePages` for visible results;
- use `getNextCommandPaletteIndex` for Arrow Up/Down;
- select the active result on Enter;
- close on Escape or backdrop click;
- cycle Tab focus among focusable dialog elements;
- expose `role="dialog"`, `aria-modal="true"`, `aria-label="Search notes"`, `role="listbox"`, and `role="option"` semantics;
- show `Recently opened` for an empty query and `Notes` for a non-empty query;
- render loading, retryable error, and no-results states;
- render each result's title and extension-free path.

Use existing Lucide icons (`Search`, `Clock3`, `FileText`, `CornerDownLeft`, and `X`) and existing CSS variables. Do not add a dependency.

- [ ] **Step 5: Run the focused test**

Run: `pnpm test -- tests/command-palette.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the modal component**

```bash
git add src/client/command-palette-model.ts src/components/command-palette.tsx tests/command-palette.test.ts
git commit -m "feat: add note command palette modal"
```

### Task 3: Global app shell, route tracking, and Explorer navigation

**Files:**
- Create: `src/client/app-shell.tsx`
- Modify: `src/client/router.tsx`
- Modify: `tests/command-palette.test.ts`
- Modify: `tests/explorer-model.test.ts`

- [ ] **Step 1: Add failing shell and router contract tests**

Assert the router imports `AppShell`, defines it as the parent `Component`, and nests all current paths beneath `children`. Add pure helper tests for an encoded Explorer destination:

```ts
expect(commandPaletteExplorerPath("01 ai/Agent Config")).toBe(
  "/explorer/01%20ai/Agent%20Config",
);
expect(commandPaletteExplorerPath("literal%20name")).toBe(
  "/explorer/literal%2520name",
);
```

Update the existing Explorer route-registration test so it still verifies that `/explorer/*` appears before `/wiki/*`, but does not assume those routes are top-level.

- [ ] **Step 2: Run the two focused test files and verify they fail**

Run: `pnpm test -- tests/command-palette.test.ts tests/explorer-model.test.ts`

Expected: FAIL because the shell and destination helper are absent.

- [ ] **Step 3: Add destination encoding to the model**

```ts
export function commandPaletteExplorerPath(slug: string) {
  const encoded = slug
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/explorer/${encoded}`;
}
```

- [ ] **Step 4: Implement `AppShell`**

Use `Outlet`, `useLocation`, and `useNavigate`. The shell should:

1. initialize recent slugs from `localStorage` with `parseRecentNoteSlugs`;
2. observe `location.pathname`, derive a slug with `noteSlugFromPathname`, promote it, and persist it;
3. install one `window` keydown listener that prevents default and opens the palette for `isCommandPaletteShortcut(event)`;
4. fetch `ExplorerPage[]` from `/api/explorer` only on the first palette opening;
5. retain `idle | loading | ready | error` request state and expose retry after failure;
6. avoid state updates after unmount or an aborted request;
7. navigate selections with `navigate(commandPaletteExplorerPath(page.slug))` and close the palette;
8. render `<Outlet />` and one `<CommandPalette />` sibling.

Normalize index slugs from `page.file` before matching Recents so the palette uses the same canonical, extension-free slash-separated slugs as Explorer. Keep this normalization as a pure exported helper in the model and cover it with a test for `.md` removal.

- [ ] **Step 5: Nest all routes under `AppShell`**

```tsx
import { AppShell } from "./app-shell";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      { path: "/setup", lazy: () => import("./routes/setup-route") },
      { path: "/", lazy: () => import("./routes/home-route") },
      { path: "/stats", lazy: () => import("./routes/stats-route") },
      { path: "/graph", lazy: () => import("./routes/graph-route") },
      { path: "/explorer/*", lazy: () => import("./routes/explorer-route") },
      { path: "/wiki/*", lazy: () => import("./routes/wiki-route") },
      { path: "*", lazy: () => import("./routes/not-found-route") },
    ],
  },
]);
```

- [ ] **Step 6: Run the focused shell and Explorer tests**

Run: `pnpm test -- tests/command-palette.test.ts tests/explorer-model.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the global integration**

```bash
git add src/client/app-shell.tsx src/client/command-palette-model.ts src/client/router.tsx tests/command-palette.test.ts tests/explorer-model.test.ts
git commit -m "feat: make note palette available app-wide"
```

### Task 4: Visual polish and responsive behavior

**Files:**
- Modify: `src/client/globals.css`
- Modify: `src/components/command-palette.tsx`
- Modify: `tests/command-palette.test.ts`

- [ ] **Step 1: Add a failing palette CSS contract test**

Read `src/client/globals.css` and assert it contains stable palette selectors and behaviors:

```ts
expect(css).toContain(".command-palette-backdrop");
expect(css).toContain(".command-palette-dialog");
expect(css).toContain(".command-palette-result[aria-selected=\"true\"]");
expect(css).toContain("backdrop-filter: blur(");
expect(css).toContain("@media (prefers-reduced-motion: reduce)");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- tests/command-palette.test.ts`

Expected: FAIL because palette styles are absent.

- [ ] **Step 3: Add polished light-theme palette styles**

Style the backdrop and dialog with the existing theme tokens. Required behavior:

- full-screen fixed backdrop above all routes;
- subtle translucent blur, not an opaque dark takeover;
- dialog width constrained to approximately `min(42rem, calc(100vw - 2rem))`;
- mobile placement near the top with safe-area-aware spacing;
- rounded surface, border, shadow, and separated search row;
- scrollable results with a bounded height;
- selected result has both a tinted background and a visible leading/accent indicator;
- title truncation and path truncation without hiding the active indicator;
- restrained fade/translate entrance animation;
- animation disabled under reduced motion.

- [ ] **Step 4: Run focused tests, typecheck, and lint**

Run:

```bash
pnpm test -- tests/command-palette.test.ts
pnpm typecheck
pnpm lint
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the visual polish**

```bash
git add src/client/globals.css src/components/command-palette.tsx tests/command-palette.test.ts
git commit -m "style: polish global command palette"
```

### Task 5: Full verification and browser interaction check

**Files:**
- Modify only if verification reveals a defect in the files above.

- [ ] **Step 1: Run the complete automated verification suite**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all commands PASS with no new warnings.

- [ ] **Step 2: Verify the palette in the running app**

Using the in-app browser at `http://localhost:5211`:

1. Open the home page and press Command-K; verify the modal opens and the search field is focused.
2. Type `Agent Config`; verify the note appears with its path.
3. Press Arrow Down and Enter; verify navigation to `/explorer/01%20ai/Agent%20Config` and that the palette closes.
4. Navigate through at least three other notes using Explorer, wiki links, and search.
5. Open the palette from `/graph` and verify the latest three unique notes appear in newest-first order.
6. Reload the page and verify Recents persist.
7. Press Escape and click the backdrop in separate openings; verify both close paths restore focus.
8. Test a narrow mobile viewport; verify the dialog fits, results scroll, and no content is clipped.
9. Simulate or force an `/api/explorer` failure; verify the current page remains usable and the palette offers Retry.

- [ ] **Step 3: Re-run affected checks after any browser-found fix**

Run the focused test for each changed file, then repeat:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all commands PASS and the browser scenarios succeed.

- [ ] **Step 4: Commit any verification fixes**

If verification required changes, stage only command-palette files and commit:

```bash
git add src/client/app-shell.tsx src/client/command-palette-model.ts src/client/router.tsx src/client/globals.css src/components/command-palette.tsx tests/command-palette.test.ts tests/explorer-model.test.ts
git commit -m "fix: harden global command palette"
```

If verification required no changes, do not create an empty commit.

## Self-Review

- Spec coverage: global shortcut, modal search, last three notes, app-wide tracking, Explorer navigation, persistence, loading/error states, accessibility, motion, mobile layout, and verification are each assigned to a task.
- Dependency check: the plan uses existing React, React Router, Lucide, CSS, and API capabilities only.
- Type consistency: the plan consistently uses `ExplorerPage`, recent slug strings, `CommandPalette` props, and `idle | loading | ready | error` request state.
- Placeholder check: implementation actions, commands, expected outcomes, and behavioral requirements are explicit; no deferred functionality remains.
