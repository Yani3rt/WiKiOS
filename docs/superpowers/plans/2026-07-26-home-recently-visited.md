# Home Recently Visited Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home’s Worth revisiting list with the four notes most recently opened on the current device.

**Architecture:** Keep the existing command-palette storage key as the single source of truth, extract its safe browser-storage access into a shared module, and raise its cap to four. The Home loader reads those local slugs, conditionally resolves them against `/api/explorer`, and passes ordered `ExplorerPage` records to `HomepageContent`; the server never receives the local history.

**Tech Stack:** React 19, React Router loaders, TypeScript, browser `localStorage`, Vitest, Tailwind CSS

## Global Constraints

- Preserve the existing `wiki-os:command-palette-recents` storage key.
- Store at most four unique decoded note slugs in newest-first order.
- Keep recent history local to the current browser and device.
- Do not add production dependencies.
- Keep the existing Home section position, colors, spacing, and hover treatment.
- Treat unavailable storage, malformed storage, a failed Explorer request, and stale slugs as non-fatal.
- Do not modify or commit unrelated `README.md` or generated `output/` changes.

---

## File structure

- Create `src/client/recent-note-storage.ts` — safe browser-storage boundary shared by `AppShell` and the Home loader.
- Modify `src/client/command-palette-model.ts` — raise the shared history cap from three to four.
- Modify `src/client/app-shell.tsx` — consume the shared storage functions instead of owning duplicate storage code.
- Modify `src/client/routes/home-route.tsx` — resolve recent local slugs into current Explorer pages.
- Modify `src/components/homepage-content.tsx` — render Recently visited rows and the empty state.
- Modify `src/lib/wiki-config.ts` — change the default visible label from Worth revisiting to Recently visited.
- Modify `wiki-os.config.ts` — update the project-level label override to Recently visited.
- Modify `tests/command-palette.test.ts` — cover four-item promotion, parsing, serialization, and shared storage failures.
- Create `tests/home-route.test.ts` — cover conditional Explorer loading, ordering, and stale-note filtering.
- Modify `tests/homepage.test.tsx` — cover Recently visited rendering and removal of Worth revisiting.

---

### Task 1: Four-item shared recent-note storage

**Files:**
- Create: `src/client/recent-note-storage.ts`
- Modify: `src/client/command-palette-model.ts:3-36`
- Modify: `src/client/app-shell.tsx:1-39`
- Test: `tests/command-palette.test.ts:1-65`

**Interfaces:**
- Consumes: `COMMAND_PALETTE_RECENTS_KEY`, `parseRecentNoteSlugs()`, and `serializeRecentNoteSlugs()` from `command-palette-model.ts`.
- Produces: `readRecentNoteSlugs(storage?: RecentNoteStorage | null): string[]` and `persistRecentNoteSlugs(recents: readonly string[], storage?: RecentNoteStorage | null): void`.

- [ ] **Step 1: Update the model tests to require four stored notes**

Change the first two tests in `tests/command-palette.test.ts` to assert four-note behavior:

```ts
it("keeps four unique recent note slugs in newest-first order", () => {
  expect(promoteRecentNote(["beta", "alpha", "gamma", "omega"], "alpha")).toEqual([
    "alpha",
    "beta",
    "gamma",
    "omega",
  ]);
  expect(promoteRecentNote(["omega", "gamma", "beta", "alpha"], "delta")).toEqual([
    "delta",
    "omega",
    "gamma",
    "beta",
  ]);
});

it("round-trips valid storage and rejects malformed storage", () => {
  const serialized = serializeRecentNoteSlugs(["alpha", "beta"]);

  expect(parseRecentNoteSlugs(serialized)).toEqual(["alpha", "beta"]);
  expect(
    parseRecentNoteSlugs('["alpha", "alpha", "beta", "gamma", "delta", "omega"]'),
  ).toEqual(["alpha", "beta", "gamma", "delta"]);
  expect(parseRecentNoteSlugs('{"bad":true}')).toEqual([]);
  expect(parseRecentNoteSlugs("not-json")).toEqual([]);
});
```

- [ ] **Step 2: Add failing shared-storage tests**

Import the new functions:

```ts
import {
  persistRecentNoteSlugs,
  readRecentNoteSlugs,
  type RecentNoteStorage,
} from "../src/client/recent-note-storage";
```

Add:

```ts
describe("recent note storage", () => {
  it("reads and writes the shared recent-note key", () => {
    const values = new Map<string, string>();
    const storage: RecentNoteStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    persistRecentNoteSlugs(["alpha", "beta", "gamma", "delta", "omega"], storage);

    expect(readRecentNoteSlugs(storage)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("survives unavailable and failing browser storage", () => {
    const failingStorage: RecentNoteStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(readRecentNoteSlugs(null)).toEqual([]);
    expect(readRecentNoteSlugs(failingStorage)).toEqual([]);
    expect(() => persistRecentNoteSlugs(["alpha"], failingStorage)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/command-palette.test.ts
```

Expected: failures because the limit is still three and `recent-note-storage.ts` does not exist.

- [ ] **Step 4: Raise the shared cap and create the storage module**

In `src/client/command-palette-model.ts`:

```ts
export const COMMAND_PALETTE_RECENTS_LIMIT = 4;
```

Create `src/client/recent-note-storage.ts`:

```ts
import {
  COMMAND_PALETTE_RECENTS_KEY,
  parseRecentNoteSlugs,
  serializeRecentNoteSlugs,
} from "./command-palette-model";

export interface RecentNoteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): RecentNoteStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentNoteSlugs(
  storage: RecentNoteStorage | null = browserStorage(),
): string[] {
  if (!storage) return [];
  try {
    return parseRecentNoteSlugs(storage.getItem(COMMAND_PALETTE_RECENTS_KEY));
  } catch {
    return [];
  }
}

export function persistRecentNoteSlugs(
  recents: readonly string[],
  storage: RecentNoteStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(COMMAND_PALETTE_RECENTS_KEY, serializeRecentNoteSlugs(recents));
  } catch {
    // Storage can be unavailable or quota-limited.
  }
}
```

- [ ] **Step 5: Reuse the module in AppShell**

Remove `COMMAND_PALETTE_RECENTS_KEY`, `parseRecentNoteSlugs`, and
`serializeRecentNoteSlugs` from the `command-palette-model.ts` import in
`src/client/app-shell.tsx`. Delete its local `readRecentNoteSlugs()` and
`persistRecentNoteSlugs()` functions, then add:

```ts
import {
  persistRecentNoteSlugs,
  readRecentNoteSlugs,
} from "./recent-note-storage";
```

Keep the existing state initializer and location effect unchanged:

```ts
const [recentSlugs, setRecentSlugs] = useState<string[]>(readRecentNoteSlugs);
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm exec vitest run tests/command-palette.test.ts
```

Expected: all command-palette tests pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/client/command-palette-model.ts src/client/recent-note-storage.ts src/client/app-shell.tsx tests/command-palette.test.ts
git commit -m "refactor: share four-note recent history"
```

---

### Task 2: Resolve local recent slugs in the Home loader

**Files:**
- Modify: `src/client/routes/home-route.tsx`
- Create: `tests/home-route.test.ts`

**Interfaces:**
- Consumes: `readRecentNoteSlugs()`, `normalizeCommandPalettePages()`, `resolveCommandPalettePages()`, `/api/home`, and `/api/explorer`.
- Produces: `HomeRouteData { homepage: HomepageData; recentlyVisitedPages: ExplorerPage[] }` and `loadRecentlyVisitedPages(recentSlugs, loadExplorer?)`.

- [ ] **Step 1: Write failing loader-helper tests**

Create `tests/home-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { loadRecentlyVisitedPages } from "../src/client/routes/home-route";
import type { ExplorerPage } from "../src/lib/wiki-shared";

const explorerPages: ExplorerPage[] = [
  {
    file: "Development/Git.md",
    slug: "stale-api-slug",
    title: "Git",
    modifiedAt: 3,
  },
  {
    file: "Inbox/Tasks.md",
    slug: "stale-api-slug",
    title: "Tasks",
    modifiedAt: 2,
  },
];

describe("Home recently visited loader", () => {
  it("skips Explorer loading when local history is empty", async () => {
    const loadExplorer = vi.fn<() => Promise<ExplorerPage[]>>();

    await expect(loadRecentlyVisitedPages([], loadExplorer)).resolves.toEqual([]);
    expect(loadExplorer).not.toHaveBeenCalled();
  });

  it("resolves current pages in stored order and omits stale slugs", async () => {
    const loadExplorer = vi.fn(async () => explorerPages);

    await expect(
      loadRecentlyVisitedPages(
        ["Inbox/Tasks", "missing", "Development/Git"],
        loadExplorer,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ title: "Tasks", slug: "Inbox/Tasks" }),
      expect.objectContaining({ title: "Git", slug: "Development/Git" }),
    ]);
  });

  it("degrades to an empty list when Explorer loading fails", async () => {
    const loadExplorer = vi.fn(async (): Promise<ExplorerPage[]> => {
      throw new Error("offline");
    });

    await expect(loadRecentlyVisitedPages(["Inbox/Tasks"], loadExplorer)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/home-route.test.ts
```

Expected: failure because `loadRecentlyVisitedPages` is not exported.

- [ ] **Step 3: Implement recent-page resolution and the route-data contract**

Update imports in `src/client/routes/home-route.tsx`:

```ts
import {
  normalizeCommandPalettePages,
  resolveCommandPalettePages,
} from "@/client/command-palette-model";
import { readRecentNoteSlugs } from "@/client/recent-note-storage";
import type { ExplorerPage, HomepageData } from "@/lib/wiki-shared";
```

Add:

```ts
export interface HomeRouteData {
  homepage: HomepageData;
  recentlyVisitedPages: ExplorerPage[];
}

export async function loadRecentlyVisitedPages(
  recentSlugs: readonly string[],
  loadExplorer: () => Promise<ExplorerPage[]> = () =>
    fetchJson<ExplorerPage[]>("/api/explorer"),
): Promise<ExplorerPage[]> {
  if (recentSlugs.length === 0) return [];

  try {
    const pages = normalizeCommandPalettePages(await loadExplorer());
    return resolveCommandPalettePages(pages, recentSlugs, "");
  } catch {
    return [];
  }
}
```

Change `loader()` so `/api/home` retains its existing redirect behavior while
recent-page resolution is non-fatal:

```ts
export async function loader(): Promise<HomeRouteData> {
  try {
    const homepage = await fetchJson<HomepageData>("/api/home");
    const recentlyVisitedPages = await loadRecentlyVisitedPages(readRecentNoteSlugs());
    return { homepage, recentlyVisitedPages };
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }
    throw error;
  }
}
```

Update `Component()`:

```tsx
export function Component() {
  const { homepage, recentlyVisitedPages } = useLoaderData() as HomeRouteData;

  return (
    <SearchBox totalPages={homepage.totalPages}>
      <HomepageContent
        homepage={homepage}
        recentlyVisitedPages={recentlyVisitedPages}
      />
    </SearchBox>
  );
}
```

- [ ] **Step 4: Run the loader tests**

Run:

```bash
pnpm exec vitest run tests/home-route.test.ts
```

Expected: all Home loader tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/client/routes/home-route.tsx tests/home-route.test.ts
git commit -m "feat: resolve recent notes for home"
```

---

### Task 3: Render Recently visited on Home

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Modify: `src/lib/wiki-config.ts:116-124`
- Modify: `wiki-os.config.ts:6-12`
- Modify: `tests/homepage.test.tsx`

**Interfaces:**
- Consumes: `recentlyVisitedPages: readonly ExplorerPage[]` from `HomeRouteData`.
- Produces: a Recently visited section in the existing `featured` slot with direct wiki links, vault-path subtitles, and an empty state.

- [ ] **Step 1: Update Home rendering tests to require Recently visited**

Import `ExplorerPage` alongside the existing shared types:

```ts
import type {
  ExplorerPage,
  HomepageData,
  PageSummary,
  SearchResult,
} from "../src/lib/wiki-shared";
```

In the existing landmark test, define:

```ts
const recentlyVisitedPages: ExplorerPage[] = [
  {
    file: "Development/Git & Terminal/Terminal Reference.md",
    slug: "Development/Git & Terminal/Terminal Reference",
    title: "Terminal Reference",
    modifiedAt: 10,
  },
];
```

Pass it to `HomepageContent`:

```ts
children: createElement(HomepageContent, {
  homepage,
  recentlyVisitedPages,
}),
```

Add these assertions:

```ts
expect(markup).toContain("Recently visited");
expect(markup).toContain("Notes you opened most recently on this device.");
expect(markup).toContain("Terminal Reference");
expect(markup).toContain("Development/Git &amp; Terminal/Terminal Reference");
expect(markup).toContain(
  'href="/wiki/Development/Git%20%26%20Terminal/Terminal%20Reference"',
);
expect(markup).not.toContain("Worth revisiting");
expect(markup).not.toContain("Connected notes worth another look.");
```

Add a separate empty-state test:

```ts
it("keeps Recently visited useful before a note has been opened", () => {
  const homepage: HomepageData = {
    totalPages: 0,
    totalWords: 0,
    featured: [],
    recentPages: [],
    categories: [],
    topConnected: [],
    people: [],
  };
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        WikiConfigProvider,
        {
          config: DEFAULT_WIKI_OS_CONFIG,
          children: createElement(HomepageContent, {
            homepage,
            recentlyVisitedPages: [],
          }),
        },
      ),
    ),
  );

  expect(markup).toContain("Recently visited");
  expect(markup).toContain("Open a note to start your recent history.");
});
```

- [ ] **Step 2: Run the Home tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: failure because `HomepageContent` does not accept or render
`recentlyVisitedPages`, and the default label is still Worth revisiting.

- [ ] **Step 3: Change the default section label**

In `src/lib/wiki-config.ts` and the matching project override in
`wiki-os.config.ts`, change:

```ts
featured: "Recently visited",
```

Keep the internal `featured` key for configuration compatibility.

- [ ] **Step 4: Add the recent-note row**

Update the shared-type import in `src/components/homepage-content.tsx`:

```ts
import {
  slugFromFileName,
  type ExplorerPage,
  type HomepageData,
  type PageSummary,
} from "@/lib/wiki-shared";
```

Add:

```tsx
function RecentlyVisitedRow({ page }: { page: ExplorerPage }) {
  const path = page.file.replace(/\.md$/iu, "");

  return (
    <Link
      to={`/wiki/${slugFromFileName(page.file)}`}
      className="home-note-link group flex min-h-14 min-w-0 items-start py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
          {page.title}
        </span>
        <span className="mt-1 block truncate text-sm leading-5 text-[var(--home-muted)]">
          {path}
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 5: Replace the featured rendering with Recently visited**

Change the component signature:

```ts
export function HomepageContent({
  homepage,
  recentlyVisitedPages,
}: {
  homepage: HomepageData;
  recentlyVisitedPages: readonly ExplorerPage[];
}) {
```

Replace the `featured` entry in `sectionViews`:

```tsx
featured: (
  <HomeSection
    sectionKey="featured"
    title={labels.featured}
    description="Notes you opened most recently on this device."
    itemCount={recentlyVisitedPages.length}
    expanded={isExpanded("featured")}
    onToggle={() => toggleSection("featured")}
  >
    {recentlyVisitedPages.length > 0 ? (
      getVisibleHomePages(recentlyVisitedPages, isExpanded("featured")).map((page) => (
        <li key={page.file}>
          <RecentlyVisitedRow page={page} />
        </li>
      ))
    ) : (
      <li className="py-4 text-sm leading-6 text-[var(--home-muted)]">
        Open a note to start your recent history.
      </li>
    )}
  </HomeSection>
),
```

Do not conditionally remove `featured` from `orderedSections`; its empty state
must remain visible.

- [ ] **Step 6: Run Home and related focused tests**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx tests/home-route.test.ts tests/command-palette.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/components/homepage-content.tsx src/lib/wiki-config.ts wiki-os.config.ts tests/homepage.test.tsx
git commit -m "feat: show recently visited notes on home"
```

---

### Task 4: Full verification and browser acceptance

**Files:**
- Verify only; no planned production-file changes.

**Interfaces:**
- Consumes: the completed storage, loader, and Home rendering behavior from Tasks 1–3.
- Produces: evidence that the feature works across tests, production build, and the running browser.

- [ ] **Step 1: Run static verification**

```bash
pnpm run lint
pnpm run typecheck
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 2: Run the complete test suite with writable test state**

```bash
mkdir -p /private/tmp/wiki-os-test-home
HOME=/private/tmp/wiki-os-test-home pnpm test
```

Expected: all test files and tests pass.

- [ ] **Step 3: Run the production build**

```bash
pnpm run build
```

Expected: client, server, and config builds complete successfully. Existing
large-chunk advisory warnings are acceptable.

- [ ] **Step 4: Verify empty history in the browser**

In a fresh browser profile or after removing only
`wiki-os:command-palette-recents`, open `http://localhost:5211/`.

Expected:

- Home shows **Recently visited** in the former Worth revisiting position.
- It shows **Open a note to start your recent history.**
- Worth revisiting copy is absent.

- [ ] **Step 5: Verify four-note ordering and promotion**

Open four different `/wiki/...` or `/explorer/...` note routes, return Home,
and confirm:

- all four notes appear newest-first;
- each row shows title and vault path;
- each row opens the intended note; and
- revisiting the oldest note moves it to the first position without duplication.

Open the command palette with `⌘K` and confirm it shows the same four notes in
the same order.

- [ ] **Step 6: Commit any verification-only test correction**

If browser acceptance required a test-only correction, stage only that test and
commit it:

```bash
git add tests/command-palette.test.ts tests/home-route.test.ts tests/homepage.test.tsx
git commit -m "test: cover recently visited home flow"
```

If no correction was needed, do not create an empty commit.

---

## Self-review

- **Spec coverage:** Four-item local history, shared command-palette reuse,
  conditional Explorer resolution, stale-note omission, empty/error behavior,
  visible copy, direct links, testing, and no server persistence are each
  assigned to a task.
- **Placeholder scan:** Every action and failure path has concrete code,
  commands, and expected results.
- **Type consistency:** `recentlyVisitedPages` is consistently
  `readonly ExplorerPage[]`; storage functions use `RecentNoteStorage`;
  `loadRecentlyVisitedPages()` always resolves to `ExplorerPage[]`.
