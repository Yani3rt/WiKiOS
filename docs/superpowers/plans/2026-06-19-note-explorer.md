# Note Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/explorer` workspace with a searchable folder tree, URL-synchronized tabs, and refresh-safe workspace persistence.

**Architecture:** A new flat `/api/explorer` endpoint reads note metadata from the existing SQLite index. Pure client helpers build the folder tree and manage versioned tab state, while a lazy-loaded React route coordinates URL navigation, local storage, responsive sidebar behavior, and existing `/api/wiki/*` note requests.

**Tech Stack:** TypeScript, React 19, React Router 7, Fastify 5, SQLite/better-sqlite3, Tailwind CSS 4, Vitest, react-markdown, remark-gfm, rehype-highlight, lucide-react.

---

## File map

- Modify `src/lib/wiki-shared.ts` — shared explorer metadata contract.
- Modify `src/lib/wiki-queries.ts` — deterministic indexed-note metadata query.
- Modify `src/lib/wiki.ts` — public wiki-core explorer function.
- Modify `src/server/app.ts` — `GET /api/explorer` route.
- Modify `tests/wiki-snapshot.test.ts` — core query contract.
- Modify `tests/server-app.test.ts` — HTTP endpoint and setup-required behavior.
- Create `src/client/explorer-model.ts` — pure tree, tab, and persistence helpers.
- Create `tests/explorer-model.test.ts` — unit tests for client helpers.
- Create `src/client/routes/explorer-route.tsx` — workspace UI and route loader.
- Modify `src/client/router.tsx` — register `/explorer/*` before `/wiki/*`.
- Modify `src/components/search-box.tsx` — add homepage navigation entry.
- Modify `src/client/globals.css` — explorer scrollbar and responsive drawer polish.

### Task 1: Add the indexed explorer metadata API

**Files:**
- Modify: `src/lib/wiki-shared.ts`
- Modify: `src/lib/wiki-queries.ts`
- Modify: `src/lib/wiki.ts`
- Modify: `src/server/app.ts`
- Test: `tests/wiki-snapshot.test.ts`
- Test: `tests/server-app.test.ts`

- [ ] **Step 1: Write the failing core query test**

In `tests/wiki-snapshot.test.ts`, add a test that creates `Root.md`, `guides/Alpha.md`, and `guides/nested/Beta.md`, calls `wiki.getExplorerPages()`, and asserts:

```ts
expect(await wiki.getExplorerPages()).toEqual([
  expect.objectContaining({ file: "guides/Alpha.md", slug: "guides/Alpha", title: "Alpha" }),
  expect.objectContaining({ file: "guides/nested/Beta.md", slug: "guides/nested/Beta", title: "Beta" }),
  expect.objectContaining({ file: "Root.md", slug: "Root", title: "Root" }),
]);
```

Create nested directories with `mkdir(..., { recursive: true })` and set explicit file timestamps with `utimes` so `modifiedAt` can also be asserted as a number.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- tests/wiki-snapshot.test.ts`

Expected: FAIL because `getExplorerPages` does not exist.

- [ ] **Step 3: Add the shared contract and minimal query**

Add to `src/lib/wiki-shared.ts`:

```ts
export interface ExplorerPage {
  file: string;
  slug: string;
  title: string;
  modifiedAt: number;
}
```

Import `ExplorerPage` in `src/lib/wiki-queries.ts`, add `getExplorerPages(): Promise<ExplorerPage[]>` to `WikiQueries`, and implement:

```ts
export async function getExplorerPages(
  deps: WikiQueryDependencies,
): Promise<ExplorerPage[]> {
  await prepareRead(deps);

  return deps.getDb().prepare(`
    SELECT file, slug, title, modified_at AS modifiedAt
    FROM pages
    ORDER BY file COLLATE NOCASE ASC, file ASC
  `).all() as ExplorerPage[];
}
```

Wire it into `createWikiQueries` and expose this wrapper from `src/lib/wiki.ts`:

```ts
export async function getExplorerPages() {
  return queries.getExplorerPages();
}
```

- [ ] **Step 4: Run the core test and verify GREEN**

Run: `pnpm test -- tests/wiki-snapshot.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing HTTP contract assertions**

In the first `tests/server-app.test.ts` test, inject `/api/explorer` and assert status 200 plus the Alpha/Beta metadata array. In the setup-required test, request `/api/explorer` before setup and assert the same 409 `SETUP_REQUIRED` contract as `/api/home`.

- [ ] **Step 6: Run the server test and verify RED**

Run: `pnpm test -- tests/server-app.test.ts`

Expected: FAIL with 404 for `/api/explorer`.

- [ ] **Step 7: Register the endpoint**

Import `getExplorerPages` into `src/server/app.ts` and register:

```ts
app.get("/api/explorer", async (_request, reply) => {
  try {
    return await getExplorerPages();
  } catch (error) {
    return replyForWikiError(error, reply, "Explorer data failed");
  }
});
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm test -- tests/wiki-snapshot.test.ts tests/server-app.test.ts`

Expected: PASS.

```bash
git add src/lib/wiki-shared.ts src/lib/wiki-queries.ts src/lib/wiki.ts src/server/app.ts tests/wiki-snapshot.test.ts tests/server-app.test.ts
git commit -m "feat: add explorer note metadata API"
```

### Task 2: Build and filter the folder tree

**Files:**
- Create: `src/client/explorer-model.ts`
- Test: `tests/explorer-model.test.ts`

- [ ] **Step 1: Write failing tree-model tests**

Create `tests/explorer-model.test.ts` with cases proving that:

```ts
const pages = [
  { file: "Root.md", slug: "Root", title: "Root", modifiedAt: 1 },
  { file: "guides/Zeta.md", slug: "guides/Zeta", title: "Zeta", modifiedAt: 2 },
  { file: "guides/nested/Alpha.md", slug: "guides/nested/Alpha", title: "Alpha", modifiedAt: 3 },
];

expect(buildExplorerTree(pages)).toMatchObject({
  folders: [{ name: "guides", folders: [{ name: "nested" }], pages: [{ title: "Zeta" }] }],
  pages: [{ title: "Root" }],
});
expect(flattenVisibleTree(buildExplorerTree(pages), new Set(["guides", "guides/nested"])))
  .toHaveLength(5);
expect(filterExplorerPages(pages, "alpha")).toEqual([pages[2]]);
expect(filterExplorerPages(pages, "GUIDES")).toEqual([pages[1], pages[2]]);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: FAIL because `src/client/explorer-model.ts` does not exist.

- [ ] **Step 3: Implement pure tree helpers**

Create `src/client/explorer-model.ts` with exported `ExplorerFolder`, `ExplorerTreeRow`, `buildExplorerTree`, `flattenVisibleTree`, `filterExplorerPages`, and `collectFolderPaths`. Build folder paths incrementally from each page's slash-separated `file`, sort folders before pages with `localeCompare(..., undefined, { sensitivity: "base" })`, and preserve each page's complete metadata.

`flattenVisibleTree` must emit rows shaped as:

```ts
export type ExplorerTreeRow =
  | { kind: "folder"; path: string; name: string; depth: number; count: number }
  | { kind: "page"; page: ExplorerPage; depth: number };
```

Folder `count` is the recursive note count. Filtering checks both `page.title` and the extension-free `page.file`, case-insensitively.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: PASS.

```bash
git add src/client/explorer-model.ts tests/explorer-model.test.ts
git commit -m "feat: add explorer folder tree model"
```

### Task 3: Add deterministic tab state and persistence

**Files:**
- Modify: `src/client/explorer-model.ts`
- Modify: `tests/explorer-model.test.ts`

- [ ] **Step 1: Write failing tab behavior tests**

Add tests for these exact transitions:

```ts
expect(openExplorerTab(state, alpha)).toEqual({ tabs: [alphaTab], activeSlug: "Alpha" });
expect(openExplorerTab({ tabs: [alphaTab], activeSlug: "Alpha" }, alpha).tabs).toHaveLength(1);
expect(closeExplorerTab({ tabs: [alphaTab, betaTab], activeSlug: "Beta" }, "Beta"))
  .toEqual({ tabs: [alphaTab], activeSlug: "Alpha" });
expect(closeOtherExplorerTabs({ tabs: [alphaTab, betaTab], activeSlug: "Alpha" }, "Beta"))
  .toEqual({ tabs: [betaTab], activeSlug: "Beta" });
expect(parseExplorerWorkspace(JSON.stringify({ version: 1, tabs: [alphaTab], activeSlug: "Alpha" })))
  .toEqual({ tabs: [alphaTab], activeSlug: "Alpha" });
expect(parseExplorerWorkspace("not-json")).toEqual(EMPTY_EXPLORER_WORKSPACE);
expect(parseExplorerWorkspace(JSON.stringify({ version: 99, tabs: [] })))
  .toEqual(EMPTY_EXPLORER_WORKSPACE);
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: FAIL because the tab helpers are missing.

- [ ] **Step 3: Implement versioned workspace helpers**

Add these exports to `src/client/explorer-model.ts`:

```ts
export interface ExplorerTab { slug: string; title: string; file: string }
export interface ExplorerWorkspace { tabs: ExplorerTab[]; activeSlug: string | null }
export const EXPLORER_STORAGE_KEY = "wiki-os:explorer-workspace";
export const EMPTY_EXPLORER_WORKSPACE: ExplorerWorkspace = { tabs: [], activeSlug: null };
```

Implement `openExplorerTab`, `activateExplorerTab`, `closeExplorerTab`, `closeOtherExplorerTabs`, `serializeExplorerWorkspace`, and `parseExplorerWorkspace`. Closing the active tab selects the tab immediately to its left, or the first remaining tab. Parsing must catch JSON errors, require `version === 1`, validate all tab strings, remove duplicate slugs, and ensure `activeSlug` references a retained tab.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: PASS.

```bash
git add src/client/explorer-model.ts tests/explorer-model.test.ts
git commit -m "feat: add persistent explorer tab state"
```

### Task 4: Implement the explorer route shell and URL synchronization

**Files:**
- Create: `src/client/routes/explorer-route.tsx`
- Modify: `src/client/router.tsx`

- [ ] **Step 1: Add a failing router source assertion**

Add a small source-level test to `tests/explorer-model.test.ts` that reads `src/client/router.tsx` and expects both `path: "/explorer/*"` and `import("./routes/explorer-route")`. This project has no DOM test dependency, so keep route behavior in the already-tested pure model rather than adding a production dependency.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: FAIL because the route is not registered.

- [ ] **Step 3: Register the lazy route**

Add before `/wiki/*` in `src/client/router.tsx`:

```ts
{
  path: "/explorer/*",
  lazy: () => import("./routes/explorer-route"),
},
```

- [ ] **Step 4: Implement loader and workspace coordination**

Create `src/client/routes/explorer-route.tsx`. Its `loader` fetches `ExplorerPage[]` from `/api/explorer` and redirects to `/setup` on setup-required responses. The component must:

- derive the route slug from `useParams()["*"]`
- restore workspace state once from `localStorage`
- open the matching metadata tab when the URL points to an indexed note
- create a fallback tab title from the slug when the URL points to a missing note
- persist every workspace transition with `serializeExplorerWorkspace`
- navigate to `/explorer/${slug}` on selection and `/explorer` when no tab remains
- fetch active content from `/api/wiki/${slug}` in an effect with `AbortController`
- distinguish loading, 404, and generic request failures
- render markdown with the same `remarkGfm` and `rehypeHighlight` configuration as `wiki-route.tsx`

Keep focused components in the same file: `ExplorerHeader`, `ExplorerSidebar`, `ExplorerTabs`, `ExplorerReader`, and `ExplorerEmptyState`. Use existing Lucide icons only; do not add dependencies.

- [ ] **Step 5: Verify route compilation and focused tests**

Run: `pnpm test -- tests/explorer-model.test.ts && pnpm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/router.tsx src/client/routes/explorer-route.tsx tests/explorer-model.test.ts
git commit -m "feat: add tabbed note explorer route"
```

### Task 5: Finish tree interactions, navigation entry, and responsive styling

**Files:**
- Modify: `src/client/routes/explorer-route.tsx`
- Modify: `src/components/search-box.tsx`
- Modify: `src/client/globals.css`

- [ ] **Step 1: Add failing static integration assertions**

Extend the source-level test to assert `search-box.tsx` contains `to="/explorer"` and the explorer route contains accessible labels `Filter notes`, `Expand all folders`, `Collapse all folders`, and `Toggle note tree`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- tests/explorer-model.test.ts`

Expected: FAIL because the navigation and labels are absent.

- [ ] **Step 3: Complete sidebar and tab interactions**

In `ExplorerSidebar`, use the pure helpers to provide:

- controlled filter input with a clear button
- expand-all/collapse-all controls based on `collectFolderPaths`
- disclosure buttons with `aria-expanded`
- active-note highlighting and recursive note count
- an empty-filter state

In `ExplorerTabs`, use buttons with `role="tab"`, `aria-selected`, close buttons with note-specific labels, and a context-safe “Close others” action shown for the active tab. Ensure close clicks stop propagation.

- [ ] **Step 4: Add the homepage explorer link**

Add a `Link` to `/explorer` in the desktop navigation group in `src/components/search-box.tsx`, labeled `Explorer`. Preserve the existing Graph and Stats links and visual treatment.

- [ ] **Step 5: Add responsive and overflow styles**

In `src/client/globals.css`, add `.explorer-scrollbar` rules for thin themed scrollbars and an `.explorer-sidebar-backdrop` fade. Use route Tailwind classes so the sidebar is fixed under `md`, translated off-canvas when closed, and statically visible from `md` upward. Add `motion-reduce:transition-none` to drawer transitions.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test -- tests/explorer-model.test.ts && pnpm run typecheck`

Expected: PASS.

```bash
git add src/client/routes/explorer-route.tsx src/components/search-box.tsx src/client/globals.css tests/explorer-model.test.ts
git commit -m "feat: polish explorer navigation and responsive layout"
```

### Task 6: Full regression and production verification

**Files:**
- Modify only files required to correct verification failures.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run static checks**

Run: `pnpm run typecheck && pnpm run lint`

Expected: both commands exit 0 with no new warnings.

- [ ] **Step 3: Run the production build**

Run: `pnpm run build`

Expected: Vite client and server/config builds complete successfully.

- [ ] **Step 4: Perform browser smoke verification**

Run `pnpm dev`, open `/explorer`, and verify:

1. nested folders expand and collapse;
2. filtering finds notes by title and path;
3. clicking notes opens non-duplicate tabs;
4. tab activation updates the URL;
5. closing the active tab selects its left neighbor;
6. refreshing restores tabs and active note;
7. direct `/explorer/guides/Alpha` navigation opens that note;
8. narrow viewport tree opens as a drawer;
9. markdown and code blocks render correctly;
10. Graph, Stats, WikiOS home, and Explorer navigation still work.

- [ ] **Step 5: Commit verification fixes if any**

If verification required changes, stage only those files and commit:

Review `git diff`, then stage tracked verification fixes with `git add -u`. If verification created a necessary new test fixture, stage that fixture by its exact path shown by `git status`. Commit with `git commit -m "fix: address explorer verification findings"`.

If no files changed, do not create an empty commit.
