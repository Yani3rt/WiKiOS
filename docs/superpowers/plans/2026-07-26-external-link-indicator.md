# External Link Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish external links from internal WikiOS note links by adding a subtle inline ↗ indicator only to off-site links in rendered notes.

**Architecture:** Keep link classification inside the shared note-viewer link pipeline so rendering and click behavior share the same internal-vs-external decision. Render the icon directly in the markdown anchor component and cover the behavior with shared note-viewer regression tests.

**Tech Stack:** React, React Router, React Markdown, TypeScript, Vitest

## Global Constraints

- Prefer `pnpm` when installing dependencies.
- Ask for confirmation before adding new production dependencies.
- Preserve existing internal wiki-link interception behavior.
- External links must remain normal anchors and must not be intercepted as note navigation.
- The visual treatment is an inline trailing external-link icon like `↗` shown only for external links.
- The icon should be decorative in the UI and exposed accessibly as an external-destination hint.

---

## File Structure

- Modify: `/Users/yani/Dev/wiki/wiki-os/src/components/note-viewer.tsx` — shared link classification helpers and markdown anchor rendering.
- Modify: `/Users/yani/Dev/wiki/wiki-os/src/client/globals.css` — subtle icon sizing, spacing, and color treatment for external-link indicators if utility classes are not sufficient.
- Modify: `/Users/yani/Dev/wiki/wiki-os/tests/shared-note-viewer.test.ts` — regression coverage for icon rendering and unchanged link interception behavior.

### Task 1: Classify internal versus external rendered note links

**Files:**
- Modify: `/Users/yani/Dev/wiki/wiki-os/src/components/note-viewer.tsx`
- Test: `/Users/yani/Dev/wiki/wiki-os/tests/shared-note-viewer.test.ts`

**Interfaces:**
- Consumes: `wikiSlugFromHref(href: string | undefined, origin: string): string | null`
- Produces: `isInternalAppHref(href: string | undefined, origin: string): boolean`
- Produces: `isExternalHref(href: string | undefined, origin: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
it("treats wiki and app routes as internal hrefs", async () => {
  const viewer = await import("../src/components/note-viewer");
  expect("isInternalAppHref" in viewer).toBe(true);
  const { isInternalAppHref, isExternalHref } = viewer as {
    isInternalAppHref: (href: string | undefined, origin: string) => boolean;
    isExternalHref: (href: string | undefined, origin: string) => boolean;
  };

  expect(isInternalAppHref("/wiki/history/Analytical%20Engine", "https://wiki.local")).toBe(true);
  expect(isInternalAppHref("/explorer/history/Analytical%20Engine", "https://wiki.local")).toBe(true);
  expect(isInternalAppHref("/graph", "https://wiki.local")).toBe(true);
  expect(isInternalAppHref("#deep-dive", "https://wiki.local")).toBe(true);
  expect(isExternalHref("https://example.com/docs", "https://wiki.local")).toBe(true);
  expect(isExternalHref("http://example.com/docs", "https://wiki.local")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts -t "treats wiki and app routes as internal hrefs"`
Expected: FAIL because `isInternalAppHref` / `isExternalHref` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function isInternalAppHref(href: string | undefined, origin: string) {
  if (!href) return false;
  if (href.startsWith("#")) return true;

  const url = new URL(href, origin);
  if (url.origin !== new URL(origin).origin) return false;

  return (
    url.pathname === "/graph" ||
    url.pathname === "/stats" ||
    url.pathname.startsWith("/wiki/") ||
    url.pathname.startsWith("/explorer/")
  );
}

export function isExternalHref(href: string | undefined, origin: string) {
  return href !== undefined && href.length > 0 && !isInternalAppHref(href, origin);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts -t "treats wiki and app routes as internal hrefs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/note-viewer.tsx tests/shared-note-viewer.test.ts
git commit -m "refactor: classify rendered note link destinations"
```

### Task 2: Render the external-link ↗ indicator in shared note markdown

**Files:**
- Modify: `/Users/yani/Dev/wiki/wiki-os/src/components/note-viewer.tsx`
- Modify: `/Users/yani/Dev/wiki/wiki-os/src/client/globals.css`
- Test: `/Users/yani/Dev/wiki/wiki-os/tests/shared-note-viewer.test.ts`

**Interfaces:**
- Consumes: `isExternalHref(href: string | undefined, origin: string): boolean`
- Produces: markdown anchor render path that adds `<span aria-hidden="true">↗</span>` for external links
- Produces: accessible label or descriptive text that indicates the destination is external

- [ ] **Step 1: Write the failing tests**

```ts
it("renders an external link indicator only for off-site links", () => {
  const page = {
    ...samplePage,
    contentMarkdown: "Internal [Ada](/wiki/Ada) and external [Docs](https://example.com/docs)",
  };

  const markup = renderToStaticMarkup(
    createElement(NoteViewer, { page, onNavigateNote: () => {} }),
  );

  expect(markup).toContain('href="https://example.com/docs"');
  expect(markup).toContain("Docs");
  expect(markup).toContain("↗");
  expect(markup).not.toContain("Ada ↗");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts -t "renders an external link indicator only for off-site links"`
Expected: FAIL because the note viewer currently renders both links identically.

- [ ] **Step 3: Write minimal implementation**

```tsx
a: ({ href, onClick, children, ...props }) => {
  const external = isExternalHref(href, origin);
  const labelText = markdownNodeText(children);
  const ariaLabel = external ? `${labelText} (opens external site)` : props["aria-label"];

  return (
    <a href={href} onClick={handleClick} aria-label={ariaLabel} {...props}>
      <span>{children}</span>
      {external ? (
        <span aria-hidden="true" className="note-link-external-indicator">
          ↗
        </span>
      ) : null}
    </a>
  );
};
```

```css
.note-link-external-indicator {
  margin-left: 0.2em;
  font-size: 0.8em;
  color: var(--muted-foreground);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts -t "renders an external link indicator only for off-site links"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/note-viewer.tsx src/client/globals.css tests/shared-note-viewer.test.ts
git commit -m "feat: add external note link indicators"
```

### Task 3: Verify click behavior remains correct for internal and external links

**Files:**
- Modify: `/Users/yani/Dev/wiki/wiki-os/tests/shared-note-viewer.test.ts`

**Interfaces:**
- Consumes: `shouldInterceptWikiLinkClick(...)`
- Consumes: `isExternalHref(href: string | undefined, origin: string): boolean`
- Produces: regression confidence that internal navigation still intercepts while external links do not

- [ ] **Step 1: Write the failing tests**

```ts
it("does not intercept external links after adding the indicator", () => {
  const event = createAnchorClickEvent();
  expect(
    shouldInterceptWikiLinkClick({
      href: "https://example.com/docs",
      origin: "https://wiki.local",
      target: undefined,
      download: undefined,
      event,
    }),
  ).toBe(false);
});

it("continues to intercept internal wiki links after adding the indicator", () => {
  const event = createAnchorClickEvent();
  expect(
    shouldInterceptWikiLinkClick({
      href: "/wiki/history/Analytical%20Engine",
      origin: "https://wiki.local",
      target: undefined,
      download: undefined,
      event,
    }),
  ).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts -t "after adding the indicator"`
Expected: FAIL only if the rendering change accidentally alters interception assumptions; if already PASS, keep these tests as the regression gate and proceed.

- [ ] **Step 3: Write minimal implementation**

```ts
// No additional production code should be needed here if Task 2 preserved
// the existing click handler and only layered the icon into the anchor
// contents. If a regression appears, restore the previous handleClick path:
const handleClick = (event: LinkNavigationEvent) => {
  if (handleNoteLinkClick({ href, origin, target: props.target, download: props.download, event, onNavigateNote })) {
    onClick?.(event);
    return;
  }
  onClick?.(event);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run tests/shared-note-viewer.test.ts`
Expected: PASS for the full shared note-viewer suite

- [ ] **Step 5: Commit**

```bash
git add tests/shared-note-viewer.test.ts src/components/note-viewer.tsx
git commit -m "test: lock external link navigation behavior"
```

### Task 4: Run full verification for the shared note-viewer change

**Files:**
- Modify: `/Users/yani/Dev/wiki/wiki-os/docs/superpowers/plans/2026-07-26-external-link-indicator.md`

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: verified implementation ready for review or browser QA

- [ ] **Step 1: Run targeted test suite**

```bash
pnpm test -- --run tests/shared-note-viewer.test.ts
```

- [ ] **Step 2: Run broader project verification**

```bash
pnpm test
pnpm typecheck
pnpm run lint
```

- [ ] **Step 3: Verify browser behavior manually**

```text
Open a wiki note containing one internal `/wiki/...` link and one external `https://...` link.
Confirm the external link shows `↗`.
Confirm the internal note link does not show `↗`.
Confirm clicking the internal note link stays inside the wiki app.
Confirm clicking the external link behaves like a normal external anchor.
```

- [ ] **Step 4: Record implementation status in the plan**

```markdown
- [ ] Task 1 complete
- [ ] Task 2 complete
- [ ] Task 3 complete
- [ ] Task 4 complete
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-26-external-link-indicator.md
git commit -m "docs: track external link indicator implementation plan"
```

## Self-Review

- Spec coverage: The plan covers link classification, inline icon rendering, accessibility hinting, preserved click behavior, and regression/full-suite verification.
- Placeholder scan: All tasks include concrete file targets, test commands, implementation snippets, and commit messages.
- Type consistency: `isInternalAppHref` and `isExternalHref` are introduced in Task 1 and reused consistently in later tasks; anchor rendering remains in `NoteViewer`.
