# Home Knowledge Dock Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width, deep-teal “Knowledge Dock” footer to Home with search, exploration, and vault actions that reuse existing WikiOS behavior.

**Architecture:** A focused `HomeFooter` presentational component renders semantic navigation and utility controls. `SearchBox` remains the state owner for search focus and reindexing, passes the footer its live data and callbacks, and renders it after Home main content so it ends both discovery and search-result views.

**Tech Stack:** React 19, TypeScript, React Router, Lucide React, Tailwind CSS utilities, shared CSS custom properties, Vitest SSR/source regression tests.

## Global Constraints

- Use the same solid `--home-hero` deep-teal background token as the Home hero.
- Add no production dependency.
- Keep the interface calm, editorial, and search-first; do not add gradients, glass, glow, decorative illustration, or entrance choreography.
- Preserve WCAG 2.2 AA contrast, semantic landmarks, visible focus, and 44px minimum interactive targets.
- Smooth search scrolling must switch to instant scrolling for `prefers-reduced-motion: reduce`.
- Reuse the existing `/api/admin/reindex` flow and accessible refresh messages.

---

### Task 1: Build the semantic Knowledge Dock component

**Files:**
- Create: `src/components/home-footer.tsx`
- Modify: `tests/homepage.test.tsx`

**Interfaces:**
- Consumes: `useWikiConfig()`, React Router `Link`, and existing Home CSS variables supplied by `.home-shell`.
- Produces: `HomeFooterRefreshStatus = "idle" | "loading" | "success" | "error"` and `HomeFooter(props: HomeFooterProps): JSX.Element`, where props are `totalPages: number`, `refreshBusy: boolean`, `refreshStatus: HomeFooterRefreshStatus`, `refreshMessage: string`, `onRefresh: () => void`, and `onFocusSearch: () => void`.

- [x] **Step 1: Write the failing footer contract test**

Add a source-level assertion to `tests/homepage.test.tsx` before the component exists so the failure is about the missing footer wiring rather than a module-resolution error:

```tsx
expect(source).toContain("<HomeFooter");
expect(source).toContain("onFocusSearch={handleFooterSearchFocus}");
expect(styles).toContain(".home-footer {");
expect(styles).toContain("background: var(--home-hero);");
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- tests/homepage.test.tsx`

Expected: FAIL because `search-box.tsx` does not render `HomeFooter` and `globals.css` has no `.home-footer` rule.

- [x] **Step 3: Create the focused footer component**

Create `src/components/home-footer.tsx` with this public contract and content structure:

```tsx
import {
  BookOpenText,
  ChartNoAxesCombined,
  Command,
  FolderCog,
  Network,
  RefreshCw,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";

export type HomeFooterRefreshStatus = "idle" | "loading" | "success" | "error";

export interface HomeFooterProps {
  totalPages: number;
  refreshBusy: boolean;
  refreshStatus: HomeFooterRefreshStatus;
  refreshMessage: string;
  onRefresh: () => void;
  onFocusSearch: () => void;
}

const exploreLinks = [
  { to: "/explorer", label: "Browse notes", icon: BookOpenText },
  { to: "/graph", label: "Graph", icon: Network },
  { to: "/stats", label: "Stats", icon: ChartNoAxesCombined },
] as const;

export function HomeFooter({
  totalPages,
  refreshBusy,
  refreshStatus,
  refreshMessage,
  onRefresh,
  onFocusSearch,
}: HomeFooterProps) {
  const config = useWikiConfig();
  const noteLabel = totalPages === 1 ? "note" : "notes";

  return (
    <footer className="home-footer mt-auto" aria-labelledby="home-footer-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 border-b border-[var(--home-hero-border)] pb-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-end">
          <div className="max-w-2xl">
            <h2 id="home-footer-heading" className="text-2xl font-semibold tracking-[-0.025em] text-[var(--home-hero-ink)] sm:text-3xl">
              Your knowledge, ready for the next connection.
            </h2>
            <p className="mt-3 max-w-[58ch] text-base leading-7 text-[var(--home-hero-muted)]">
              Return to search, follow a relationship, or keep your local index fresh.
            </p>
          </div>
          <button type="button" onClick={onFocusSearch} className="home-footer-primary">
            <Search aria-hidden className="h-5 w-5" />
            Search your notes
          </button>
        </div>

        <div className="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-3">
          <nav aria-labelledby="home-footer-explore-heading">
            <h3 id="home-footer-explore-heading" className="home-footer-label">Explore</h3>
            <ul className="mt-3 space-y-1">
              {exploreLinks.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="home-footer-link">
                    <Icon aria-hidden className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="home-footer-vault-heading">
            <h3 id="home-footer-vault-heading" className="home-footer-label">Vault</h3>
            <p className="mt-4 text-sm tabular-nums text-[var(--home-hero-muted)]">
              {totalPages.toLocaleString()} {noteLabel} indexed
            </p>
            <div className="mt-2 space-y-1">
              <button type="button" onClick={onRefresh} disabled={refreshBusy} aria-busy={refreshBusy} className="home-footer-link w-full">
                <RefreshCw aria-hidden className={`h-4 w-4 motion-reduce:animate-none ${refreshBusy ? "animate-spin" : ""}`} />
                {refreshStatus === "error" ? "Retry refresh" : "Refresh index"}
              </button>
              <Link to="/setup?change=1" className="home-footer-link">
                <FolderCog aria-hidden className="h-4 w-4" />
                Change vault
              </Link>
            </div>
            {refreshMessage ? (
              <p role={refreshStatus === "error" ? "alert" : "status"} aria-live="polite" className="mt-3 text-sm text-[var(--home-hero-muted)]">
                {refreshMessage}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="home-footer-shortcut-heading">
            <h3 id="home-footer-shortcut-heading" className="home-footer-label">Quick search</h3>
            <div className="mt-4 flex items-start gap-3 text-sm leading-6 text-[var(--home-hero-muted)]">
              <Command aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[var(--home-hero-accent)]" />
              <p><kbd className="home-footer-kbd">⌘K</kbd> opens search from anywhere in WikiOS.</p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--home-hero-border)] pt-6 text-sm text-[var(--home-hero-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-[var(--home-hero-ink)]">{config.siteTitle}</span>
          <span>Local-first. Your notes stay on this machine.</span>
        </div>
      </div>
    </footer>
  );
}
```

- [x] **Step 4: Add an SSR component test**

Import `HomeFooter` and render it inside `MemoryRouter` and `WikiConfigProvider` in `tests/homepage.test.tsx`:

```tsx
it("renders the Knowledge Dock as useful semantic navigation", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        WikiConfigProvider,
        {
          config: DEFAULT_WIKI_OS_CONFIG,
          children: createElement(HomeFooter, {
            totalPages: 30,
            refreshBusy: false,
            refreshStatus: "idle",
            refreshMessage: "",
            onRefresh: () => undefined,
            onFocusSearch: () => undefined,
          }),
        },
      ),
    ),
  );

  expect(markup).toContain("<footer");
  expect(markup).toContain("Your knowledge, ready for the next connection.");
  expect(markup).toContain('href="/explorer"');
  expect(markup).toContain('href="/graph"');
  expect(markup).toContain('href="/stats"');
  expect(markup).toContain('href="/setup?change=1"');
  expect(markup).toContain("30 notes indexed");
  expect(markup).toContain("Search your notes");
  expect(markup).toContain("Refresh index");
  expect(markup).toContain("⌘K");
  expect(markup).toContain("Local-first");
});
```

- [x] **Step 5: Run the focused test**

Run: `pnpm test -- tests/homepage.test.tsx`

Expected: the new SSR component test passes, while the source contract still fails until Task 2 wires the footer.

### Task 2: Wire shared behavior, styling, and reduced motion

**Files:**
- Modify: `src/components/search-box.tsx`
- Modify: `src/client/globals.css`
- Modify: `tests/homepage.test.tsx`

**Interfaces:**
- Consumes: `HomeFooter` and `HomeFooterRefreshStatus` from Task 1.
- Produces: `getHomeSearchScrollBehavior(reducedMotion: boolean): ScrollBehavior` and a rendered `HomeFooter` with live search and refresh callbacks.

- [x] **Step 1: Add a failing reduced-motion helper test**

Import `getHomeSearchScrollBehavior` from `search-box.tsx` and add:

```tsx
it("uses instant search scrolling when reduced motion is requested", () => {
  expect(getHomeSearchScrollBehavior(false)).toBe("smooth");
  expect(getHomeSearchScrollBehavior(true)).toBe("auto");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- tests/homepage.test.tsx`

Expected: FAIL because `getHomeSearchScrollBehavior` is not exported.

- [x] **Step 3: Wire the footer into SearchBox**

In `src/components/search-box.tsx`:

```tsx
import {
  HomeFooter,
  type HomeFooterRefreshStatus,
} from "@/components/home-footer";

type RefreshStatus = HomeFooterRefreshStatus;

export function getHomeSearchScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
```

Add this callback after `handleRefresh`:

```tsx
const handleFooterSearchFocus = () => {
  const input = inputRef.current;
  if (!input) return;

  input.focus({ preventScroll: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.scrollIntoView({
    behavior: getHomeSearchScrollBehavior(reducedMotion),
    block: "center",
  });
};
```

Render this after `</main>` and before the closing `.home-shell` div:

```tsx
<HomeFooter
  totalPages={totalPages}
  refreshBusy={refreshBusy}
  refreshStatus={refreshStatus}
  refreshMessage={refreshMessage}
  onRefresh={handleRefresh}
  onFocusSearch={handleFooterSearchFocus}
/>
```

- [x] **Step 4: Add the deep-teal footer styles**

Add to the Home section of `src/client/globals.css`:

```css
.home-footer {
  border-top: 1px solid var(--home-hero-border);
  background: var(--home-hero);
  color: var(--home-hero-ink);
}

.home-footer-label {
  color: var(--home-hero-accent);
  font-size: 0.875rem;
  font-weight: 600;
}

.home-footer-primary,
.home-footer-link {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.65rem;
  border-radius: 0.5rem;
  transition:
    background-color 150ms var(--ease-out),
    color 150ms var(--ease-out),
    border-color 150ms var(--ease-out);
}

.home-footer-primary {
  justify-content: center;
  border: 1px solid var(--home-hero-control-border);
  background: var(--home-hero-chip);
  padding: 0.75rem 1rem;
  color: var(--home-hero-ink);
  font-weight: 600;
}

.home-footer-primary:hover,
.home-footer-link:hover {
  background: var(--home-hero-hover);
  color: var(--home-hero-ink);
}

.home-footer-link {
  padding: 0.45rem 0.65rem;
  color: var(--home-hero-muted);
  text-align: left;
}

.home-footer-link svg {
  color: var(--home-hero-accent);
}

.home-footer-kbd {
  border: 1px solid var(--home-hero-control-border);
  border-radius: 0.25rem;
  background: var(--home-hero-chip);
  padding: 0.15rem 0.4rem;
  color: var(--home-hero-ink);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 600;
}
```

Include `.home-footer` in the forced-colors border selector and `.home-footer-primary`/`.home-footer-link` in the reduced-motion transition reset so the footer remains legible and still for those modes.

- [x] **Step 5: Run focused and full verification**

Run:

```bash
pnpm test -- tests/homepage.test.tsx
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run build
git diff --check
```

Expected: all Vitest tests pass; ESLint and both TypeScript configurations report no errors; Vite/server/config builds finish successfully; `git diff --check` prints no output.

- [x] **Step 6: Review the footer at responsive widths**

At `http://localhost:5211/`, verify desktop and mobile behavior:

1. Footer background visually matches the Home hero.
2. Three utility groups stack cleanly on mobile and use 44px targets.
3. “Search your notes” focuses the hero search; scrolling is smooth unless reduced motion is enabled.
4. Refresh index shows the same loading/success/error feedback in hero and footer.
5. Browse notes, Graph, Stats, and Change vault navigate to the correct routes.
