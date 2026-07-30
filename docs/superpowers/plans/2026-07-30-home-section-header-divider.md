# Home Section Header Divider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shared Home section accent divider from above the header to below the complete header block.

**Architecture:** Change only `HomeSection` markup and classes so every configured section inherits the new pattern. Use a data attribute in server-rendered tests to make the divider location explicit and stable.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

## Global Constraints

- Apply the divider placement to every Home knowledge section.
- Keep note-row dividers and progress bars unchanged.
- Preserve expansion, hover, and navigation behavior.
- Add no production dependencies.

---

### Task 1: Move the shared section divider

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Uses: existing shared `HomeSection`

- [ ] **Step 1: Write failing header-divider assertions**

Replace the old section-top-border assertion with:

```ts
expect(markup).not.toContain(
  '<section aria-labelledby="home-recentPages-heading" class="border-t-2',
);
expect(markup).toContain('data-home-section-header="true"');
expect(markup).toContain(
  'border-b-2 border-[var(--home-accent)] pb-4',
);
expect(markup.match(/data-home-section-header="true"/gu)?.length).toBe(4);
```

The fixture includes Recently updated, Recently visited, People, and Highly connected, so the count verifies universal use.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because sections still use `border-t-2` and header wrappers do not have the data attribute or bottom border.

- [ ] **Step 3: Move the divider in HomeSection**

Change the section wrapper to:

```tsx
<section aria-labelledby={headingId}>
```

Change the header wrapper to:

```tsx
<div
  data-home-section-header="true"
  className="mb-3 flex items-start justify-between gap-4 border-b-2 border-[var(--home-accent)] pb-4"
>
```

Do not change the title, description, Show all button, or list markup.

- [ ] **Step 4: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-section-header-divider
HOME=/private/tmp/wiki-os-test-section-header-divider pnpm test
```

Expected: focused tests, typecheck, lint, diff check, and the full suite pass.

- [ ] **Step 5: Verify the live Home page**

At `http://localhost:5211/`, confirm:

- the accent divider appears beneath each visible section header,
- the title, description, and Show all control remain above the divider,
- first-row spacing remains comfortable,
- row dividers and progress bars are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "refine: move home section dividers"
```
