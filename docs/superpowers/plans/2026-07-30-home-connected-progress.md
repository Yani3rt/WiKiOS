# Home Highly Connected Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Highly connected row dividers with proportional backlink progress bars and present backlink counts as tag pills.

**Architecture:** Add a small normalization helper and a dedicated `ConnectedPageRow` inside the existing Homepage component module. Extend `HomeSection` with an explicit divider toggle so only Highly connected opts out of the shared list dividers.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS, Vitest, Lucide React

## Global Constraints

- Apply the new row treatment only to Highly connected.
- Highest backlink count is 100%; every other fill is proportional to that maximum.
- Keep the backlink count visible as text and mark the visual bar decorative.
- Add no production dependencies.

---

### Task 1: Add proportional Highly connected rows

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Produces: `getBacklinkProgressPercentage(backlinkCount: number, maximumBacklinkCount: number): number`
- Produces: `ConnectedPageRow({ page, maximumBacklinkCount }: { page: PageSummary; maximumBacklinkCount: number })`
- Extends: `HomeSection` with `showDividers?: boolean`, defaulting to `true`

- [ ] **Step 1: Write failing normalization and markup tests**

Import `getBacklinkProgressPercentage` from `homepage-content` and add:

```ts
expect(getBacklinkProgressPercentage(6, 6)).toBe(100);
expect(getBacklinkProgressPercentage(5, 6)).toBeCloseTo(83.333, 3);
expect(getBacklinkProgressPercentage(0, 0)).toBe(0);
expect(getBacklinkProgressPercentage(10, 5)).toBe(100);
```

In the populated Homepage render assertions, add:

```ts
expect(markup).toContain('data-home-connected-row="true"');
expect(markup).toContain('data-home-backlink-progress="true"');
expect(markup).toContain("rounded-full bg-[var(--home-accent-soft)]");
expect(markup).toContain(">1 backlink<");
expect(markup).toContain(">4 backlinks<");
```

Extract the Highly connected list opening tag and verify it omits dividers while another section keeps them:

```ts
const connectedListTag = markup.match(/<ul id="home-topConnected-list"[^>]*>/u)?.[0] ?? "";
const recentListTag = markup.match(/<ul id="home-recentPages-list"[^>]*>/u)?.[0] ?? "";
expect(connectedListTag).not.toContain("divide-y");
expect(recentListTag).toContain("divide-y");
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because `getBacklinkProgressPercentage` and the connected-row markup do not exist.

- [ ] **Step 3: Add the normalization helper**

In `src/components/homepage-content.tsx`, add:

```ts
export function getBacklinkProgressPercentage(
  backlinkCount: number,
  maximumBacklinkCount: number,
) {
  if (maximumBacklinkCount <= 0) return 0;
  return Math.min(100, Math.max(0, (backlinkCount / maximumBacklinkCount) * 100));
}
```

- [ ] **Step 4: Add the dedicated connected row**

Add a `ConnectedPageRow` that:

- keeps the `home-note-link group` classes,
- renders a single-line truncated title left,
- renders a compact tag pill right using singular/plural backlink text,
- renders a 4px rounded neutral track below the top line,
- renders the accent fill with an inline percentage width,
- marks the progress wrapper `aria-hidden="true"` and `data-home-backlink-progress="true"`,
- adds `data-home-connected-row="true"` to the link.

Use these core classes:

```tsx
<Link className="home-note-link group flex min-h-14 min-w-0 flex-col justify-center gap-2 py-3 text-left">
  <span className="flex min-w-0 items-center justify-between gap-3">
    <span className="min-w-0 truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
      {page.title}
    </span>
    <span className="shrink-0 rounded-full bg-[var(--home-accent-soft)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--home-accent)]">
      {page.backlinkCount.toLocaleString()} {page.backlinkCount === 1 ? "backlink" : "backlinks"}
    </span>
  </span>
  <span
    aria-hidden="true"
    data-home-backlink-progress="true"
    className="h-1 w-full overflow-hidden rounded-full bg-[var(--home-border)]"
  >
    <span
      className="block h-full rounded-full bg-[var(--home-accent)]"
      style={{ width: `${percentage}%` }}
    />
  </span>
</Link>
```

- [ ] **Step 5: Scope divider removal and pass the maximum**

Extend `HomeSection` with `showDividers = true` and render:

```tsx
<ul
  id={`home-${sectionKey}-list`}
  className={showDividers ? "divide-y divide-[var(--home-border)]" : ""}
>
```

For `topConnected`, set `showDividers={false}`, compute:

```ts
const maximumBacklinkCount = Math.max(
  0,
  ...homepage.topConnected.map((page) => page.backlinkCount),
);
```

and render `ConnectedPageRow` instead of `PageRow`.

- [ ] **Step 6: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-connected-progress
HOME=/private/tmp/wiki-os-test-connected-progress pnpm test
```

Expected: Homepage tests pass, typecheck/lint/diff check pass, and the full suite remains green.

- [ ] **Step 7: Verify the live Home page**

At `http://localhost:5211/`, verify desktop and mobile:

- highest backlink bar is full width,
- lower values are proportional,
- backlink counts appear as pills,
- names remain readable and truncated safely,
- Highly connected has no row dividers,
- hover-card animation remains intact.

- [ ] **Step 8: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "feat: visualize connected note strength"
```
