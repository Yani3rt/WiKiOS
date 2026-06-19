# Shared Note Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make direct wiki pages and explorer tabs render the same full-featured note viewer.

**Architecture:** Extract article presentation and behavior from `wiki-route.tsx` into a route-agnostic `NoteViewer`. Route wrappers supply note navigation, refresh behavior, and the relevant scroll container while preserving their existing headers, tabs, folder tree, persistence, and canonical slug rules.

**Tech Stack:** TypeScript, React 19, React Router 7, react-markdown, remark-gfm, rehype-highlight, Vitest, Tailwind CSS 4.

---

## File map

- Create `src/components/note-viewer.tsx` — shared article, TOC, graph, metadata, person controls, and Markdown rendering.
- Modify `src/client/routes/wiki-route.tsx` — direct-route loader and chrome around `NoteViewer`.
- Modify `src/client/routes/explorer-route.tsx` — active tab renders `NoteViewer` and refreshes after person changes.
- Create `tests/shared-note-viewer.test.ts` — extraction and route integration contracts.

### Task 1: Extract the full article viewer

**Files:**
- Create: `src/components/note-viewer.tsx`
- Modify: `src/client/routes/wiki-route.tsx`
- Test: `tests/shared-note-viewer.test.ts`

- [ ] **Step 1: Write the failing shared-viewer contract test**

Create `tests/shared-note-viewer.test.ts` and read the three source files. Assert that `note-viewer.tsx` exports `NoteViewer`, accepts `page`, `onNavigateNote`, `onRefreshPage`, and `scrollContainerRef`, and contains the existing feature markers `TableOfContents`, `NeighborhoodGraph`, `Related Concepts`, `Mark as person`, and `ReactMarkdown`. Assert `wiki-route.tsx` imports and renders `NoteViewer`.

```ts
expect(noteViewerSource).toContain("export function NoteViewer");
expect(noteViewerSource).toContain("onNavigateNote");
expect(noteViewerSource).toContain("scrollContainerRef");
expect(wikiRouteSource).toContain('import { NoteViewer } from "@/components/note-viewer"');
expect(wikiRouteSource).toContain("<NoteViewer");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec vitest run tests/shared-note-viewer.test.ts`

Expected: FAIL because `src/components/note-viewer.tsx` does not exist.

- [ ] **Step 3: Define the shared component contract**

Use this public interface in `src/components/note-viewer.tsx`:

```ts
export interface NoteViewerProps {
  page: WikiPageData;
  onNavigateNote: (slug: string) => void;
  onRefreshPage?: () => void | Promise<void>;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  showBreadcrumb?: boolean;
}
```

`showBreadcrumb` defaults to `false`; the direct wrapper keeps its breadcrumb outside the component, so do not move route chrome into the shared viewer.

- [ ] **Step 4: Move article behavior without changing its output**

Move from `wiki-route.tsx` into `note-viewer.tsx`:

- Markdown component map and plugin constants
- date, word-count, and reading-time helpers
- active-heading hook, updated to observe either `scrollContainerRef.current` or the window viewport
- Markdown section splitting and related-link extraction
- mini neighborhood graph and all supporting types/helpers
- person image and person-override controls
- title/metadata, mobile TOC, article, related chips, desktop TOC, and graph markup

Replace direct `navigate(`/wiki/${slug}`)` calls with `onNavigateNote(slug)`. For Markdown links and related links whose pathname starts with `/wiki/`, prevent default navigation and pass the decoded wiki slug to `onNavigateNote`.

On a successful person-override request, execute:

```ts
await onRefreshPage?.();
```

Keep the current page visible if refresh fails; display the error beside the controls.

- [ ] **Step 5: Refactor the direct route wrapper**

Keep the loader, site header, breadcrumb, outer centered main, and route error boundary in `wiki-route.tsx`. Render:

```tsx
<NoteViewer
  page={page}
  onNavigateNote={(slug) => navigate(`/wiki/${slug}`)}
  onRefreshPage={() => revalidate()}
/>
```

Remove all moved helpers and unused imports from the route.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm exec vitest run tests/shared-note-viewer.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build:client
```

Expected: all commands exit 0.

```bash
git add src/components/note-viewer.tsx src/client/routes/wiki-route.tsx tests/shared-note-viewer.test.ts
git commit -m "refactor: extract shared note viewer"
```

### Task 2: Render the shared viewer inside explorer tabs

**Files:**
- Modify: `src/client/routes/explorer-route.tsx`
- Modify: `tests/shared-note-viewer.test.ts`

- [ ] **Step 1: Write the failing explorer integration assertions**

Extend `tests/shared-note-viewer.test.ts`:

```ts
expect(explorerRouteSource).toContain('import { NoteViewer } from "@/components/note-viewer"');
expect(explorerRouteSource).toContain("<NoteViewer");
expect(explorerRouteSource).not.toContain("<ReactMarkdown");
expect(explorerRouteSource).toContain("scrollContainerRef={workspaceScrollRef}");
expect(explorerRouteSource).toContain("onRefreshPage={refreshActivePage}");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec vitest run tests/shared-note-viewer.test.ts`

Expected: FAIL because Explorer still owns its reduced Markdown reader.

- [ ] **Step 3: Replace the explorer reader**

Delete Explorer's Markdown plugin/component map and ready-state article markup. Keep loading, missing, error, and empty states. In the ready state render:

```tsx
<NoteViewer
  page={state.page}
  onNavigateNote={onWikiLink}
  onRefreshPage={onRefreshPage}
  scrollContainerRef={scrollContainerRef}
/>
```

Pass `workspaceScrollRef` from the route's scrollable workspace element into `ExplorerReader` and then into `NoteViewer`.

- [ ] **Step 4: Add explorer refresh behavior**

Extract the active-page request into a `loadPage(slug, signal?)` callback that returns `WikiPageData`. Implement `refreshActivePage` so it fetches the current active slug using `encodeExplorerApiSlug`, then replaces `ReaderState` only if that slug remains active:

```ts
const refreshActivePage = useCallback(async () => {
  const slug = workspace.activeSlug;
  if (!slug) return;
  const page = await loadPage(slug);
  setReaderState((current) =>
    workspaceRef.current.activeSlug === slug
      ? { slug, status: "ready", page }
      : current,
  );
}, [loadPage, workspace.activeSlug]);
```

Use the existing workspace ref or add one synchronized in an effect so an async refresh cannot replace a newly selected tab.

- [ ] **Step 5: Preserve explorer navigation and scroll behavior**

Keep `onWikiLink` routed through canonical explorer metadata and guarded navigation. On active slug change, call `workspaceScrollRef.current?.scrollTo({ top: 0 })`. The shared viewer's TOC must use the same ref for active-heading detection and smooth scrolling.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm exec vitest run tests/shared-note-viewer.test.ts tests/explorer-model.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build:client
```

Expected: all commands exit 0.

```bash
git add src/client/routes/explorer-route.tsx tests/shared-note-viewer.test.ts
git commit -m "refactor: reuse note viewer in explorer"
```

### Task 3: Full regression and browser parity verification

**Files:**
- Modify only files required to fix verification failures.

- [ ] **Step 1: Run the complete automated checks**

Run the test suite with permission to create hashed indexes under `~/.wiki-os`, then run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
```

Expected: 0 test failures and all commands exit 0.

- [ ] **Step 2: Compare both routes in the browser**

Start `pnpm dev` with the bundled sample vault. Open these routes at the same desktop viewport:

- `http://localhost:5211/wiki/getting-started`
- `http://localhost:5211/explorer/getting-started`

Verify identical title typography, metadata, category treatment, body width, Markdown spacing, mobile TOC, desktop TOC, related concepts, and graph behavior. The only intentional differences are direct-route header/breadcrumb versus explorer tree/tabs.

- [ ] **Step 3: Verify interactions**

In Explorer, click an internal wiki link and verify it opens or activates a tab. Exercise TOC scrolling and person controls when the sample data exposes them. Confirm console logs contain no new application errors.

- [ ] **Step 4: Commit verification fixes if needed**

If fixes were required, review `git diff`, stage only the changed source/test files, and commit with:

```bash
git commit -m "fix: align shared note viewer behavior"
```

Do not create an empty commit when verification requires no changes.
