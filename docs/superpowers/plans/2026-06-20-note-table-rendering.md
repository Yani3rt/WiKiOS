# Responsive Note Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Markdown tables in notes with polished visual hierarchy and horizontal scrolling on narrow screens.

**Architecture:** Extend the existing `react-markdown` component map in `NoteViewer` with a semantic table renderer wrapped by a presentation-only overflow container. Keep all visual rules scoped under `.prose-wiki` in the existing global stylesheet so both the wiki route and explorer reuse the same behavior.

**Tech Stack:** React 19, TypeScript, react-markdown, remark-gfm, CSS, Vitest, React server rendering

---

## File Map

- Modify: `src/components/note-viewer.tsx` — add the responsive wrapper around GFM table output.
- Modify: `src/client/globals.css` — style the wrapper and semantic table elements.
- Modify: `tests/shared-note-viewer.test.ts` — verify semantic markup, wrapper output, and key responsive CSS contracts.

### Task 1: Add the semantic responsive table renderer

**Files:**
- Modify: `tests/shared-note-viewer.test.ts:317-410`
- Modify: `src/components/note-viewer.tsx:757-825`

- [ ] **Step 1: Write the failing rendering test**

Add this test inside `describe("shared note viewer rendering and route boundaries", ...)`:

```tsx
it("wraps GFM tables for horizontal scrolling while preserving semantic markup", () => {
  const tablePage: WikiPageData = {
    ...samplePage,
    contentMarkdown: [
      "| Name | Role |",
      "| :--- | ---: |",
      "| Ada | Mathematician |",
    ].join("\n"),
    headings: [],
  };
  const markup = renderToStaticMarkup(
    createElement(
      WikiConfigProvider as never,
      { config: DEFAULT_WIKI_OS_CONFIG },
      createElement(
        MemoryRouter,
        undefined,
        createElement(NoteViewer, { page: tablePage, onNavigateNote: () => {} }),
      ),
    ),
  );

  expect(markup).toContain('class="note-table-scroll"');
  expect(markup).toMatch(/<div class="note-table-scroll"><table>/u);
  expect(markup).toContain("<thead>");
  expect(markup).toContain("<tbody>");
  expect(markup).toContain('<th style="text-align:left">Name</th>');
  expect(markup).toContain('<th style="text-align:right">Role</th>');
  expect(markup).toContain("<td>Ada</td>");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts -t "wraps GFM tables"
```

Expected: FAIL because the rendered markup does not contain `note-table-scroll`.

- [ ] **Step 3: Add the minimal table component mapping**

Add this entry to the `markdownComponents` object in `src/components/note-viewer.tsx`, near the existing paragraph/list mappings:

```tsx
table: ({ node, ...props }) => {
  void node;
  return (
    <div className="note-table-scroll">
      <table {...props} />
    </div>
  );
},
```

Do not add roles or labels to the wrapper; the nested native table carries the semantics.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts -t "wraps GFM tables"
```

Expected: PASS.

- [ ] **Step 5: Commit the renderer and test**

```bash
git add src/components/note-viewer.tsx tests/shared-note-viewer.test.ts
git commit -m "feat: wrap note tables for responsive scrolling"
```

### Task 2: Add polished, responsive table styling

**Files:**
- Modify: `tests/shared-note-viewer.test.ts:430-465`
- Modify: `src/client/globals.css:129-243`

- [ ] **Step 1: Write the failing CSS contract test**

Add this test in the same rendering-and-boundaries describe block:

```ts
it("styles note tables for readable horizontal overflow", () => {
  const globalsSource = readFileSync(
    fileURLToPath(new URL("../src/client/globals.css", import.meta.url)),
    "utf8",
  );

  expect(globalsSource).toMatch(
    /\.prose-wiki \.note-table-scroll\s*\{[^}]*overflow-x:\s*auto;/u,
  );
  expect(globalsSource).toMatch(
    /\.prose-wiki \.note-table-scroll table\s*\{[^}]*min-width:\s*36rem;/u,
  );
  expect(globalsSource).toMatch(
    /\.prose-wiki \.note-table-scroll th\s*\{[^}]*font-weight:\s*600;/u,
  );
  expect(globalsSource).toContain(".prose-wiki .note-table-scroll tbody tr:nth-child(even)");
});
```

- [ ] **Step 2: Run the CSS contract test and verify it fails**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts -t "styles note tables"
```

Expected: FAIL because `.note-table-scroll` styles do not exist.

- [ ] **Step 3: Add the table styles**

Insert the following after the `.prose-wiki blockquote` rules in `src/client/globals.css`:

```css
.prose-wiki .note-table-scroll {
  max-width: 100%;
  margin: 1.5rem 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 0.875rem;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 8px 24px -18px rgba(21, 19, 26, 0.32);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(91, 74, 122, 0.3) transparent;
}

.prose-wiki .note-table-scroll table {
  width: 100%;
  min-width: 36rem;
  border-collapse: collapse;
  font-size: 0.925rem;
  line-height: 1.55;
}

.prose-wiki .note-table-scroll th,
.prose-wiki .note-table-scroll td {
  padding: 0.75rem 1rem;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.prose-wiki .note-table-scroll th:last-child,
.prose-wiki .note-table-scroll td:last-child {
  border-right: 0;
}

.prose-wiki .note-table-scroll tr:last-child td {
  border-bottom: 0;
}

.prose-wiki .note-table-scroll th {
  background: var(--lavender-soft);
  color: var(--foreground);
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.prose-wiki .note-table-scroll tbody tr:nth-child(even) {
  background: rgba(246, 243, 250, 0.55);
}

.prose-wiki .note-table-scroll tbody tr {
  transition: background-color 150ms var(--ease-out);
}

.prose-wiki .note-table-scroll tbody tr:hover {
  background: var(--teal-soft);
}

.prose-wiki .note-table-scroll::-webkit-scrollbar {
  height: 0.5rem;
}

.prose-wiki .note-table-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(91, 74, 122, 0.3);
  background-clip: padding-box;
}
```

Keep selectors scoped beneath `.prose-wiki` so application and database tables are unaffected.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- tests/shared-note-viewer.test.ts -t "styles note tables"
```

Expected: PASS.

- [ ] **Step 5: Commit the styling and test**

```bash
git add src/client/globals.css tests/shared-note-viewer.test.ts
git commit -m "style: polish rendered note tables"
```

### Task 3: Verify the complete table experience

**Files:**
- Verify: `src/components/note-viewer.tsx`
- Verify: `src/client/globals.css`
- Verify: `tests/shared-note-viewer.test.ts`

- [ ] **Step 1: Run the complete shared-viewer test file**

```bash
pnpm test -- tests/shared-note-viewer.test.ts
```

Expected: all tests in the file PASS.

- [ ] **Step 2: Run repository validation**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all commands exit successfully with no failures or type/lint errors.

- [ ] **Step 3: Verify the wide-table layout in the live app**

Open an existing note containing a GFM table at the desktop note width, then narrow the explorer note pane below `36rem`.

Expected:

- The table header is visually distinct from body rows.
- Cell content remains comfortably padded and readable.
- Wide columns retain their width instead of crushing or wrapping every word.
- The table scrolls horizontally inside its own rounded container.
- The note page itself does not gain horizontal overflow.
- GFM left/right alignment remains visible.

- [ ] **Step 4: Review the diff for scope and accidental changes**

```bash
git diff HEAD~2 -- src/components/note-viewer.tsx src/client/globals.css tests/shared-note-viewer.test.ts
git status --short
```

Expected: only the table renderer, table styles, and focused tests are part of the two implementation commits. Pre-existing unrelated worktree changes remain untouched.

