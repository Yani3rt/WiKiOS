# Home Section Icon Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Home knowledge section a destination-card-style icon tile with its title and subtitle stacked to the right.

**Architecture:** Restructure only the shared `HomeSection` header content and enlarge the four supplied Lucide icons. Add explicit data markers for stable server-rendered assertions across all populated section types.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Vitest

## Global Constraints

- Apply the icon-tile composition to every Home knowledge section.
- Use a 40×40px tile and a 20px icon.
- Keep Show all at the far right and preserve the bottom divider.
- Add no production dependencies.

---

### Task 1: Add shared icon-tile section headers

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Uses: existing `HomeSection` `icon: ReactNode`

- [ ] **Step 1: Write failing icon-tile assertions**

In the populated Homepage markup test, add:

```ts
expect(markup).toContain('data-home-section-icon-tile="true"');
expect(markup.match(/data-home-section-icon-tile="true"/gu)?.length).toBe(4);
expect(markup).toContain(
  "h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--home-accent-soft)]",
);
expect(markup).toContain(
  "mb-3 flex items-center justify-between gap-4 border-b-2",
);
expect(markup.match(/h-5 w-5 shrink-0 text-\[var\(--home-accent\)\]/gu)?.length).toBe(4);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because no section icon tile exists and icons remain 16px.

- [ ] **Step 3: Restructure the shared header**

Change the outer header alignment from `items-start` to `items-center`. Then replace the current title container with:

```tsx
<div className="flex min-w-0 items-center gap-3">
  <span
    aria-hidden="true"
    data-home-section-icon-tile="true"
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--home-accent-soft)] text-[var(--home-accent)]"
  >
    {icon}
  </span>
  <div className="min-w-0">
    <h2
      id={headingId}
      className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-[var(--home-accent)]"
    >
      {title}
    </h2>
    <p className="mt-0.5 text-sm leading-5 text-[var(--home-muted)]">
      {description}
    </p>
  </div>
</div>
```

Keep the existing Show all button and bottom divider.

- [ ] **Step 4: Enlarge every supplied icon**

Change each section icon from:

```tsx
className="h-4 w-4 shrink-0 text-[var(--home-accent)]"
```

to:

```tsx
className="h-5 w-5 shrink-0 text-[var(--home-accent)]"
```

Keep each icon's existing `aria-hidden="true"` attribute.

- [ ] **Step 5: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-section-icon-tiles
HOME=/private/tmp/wiki-os-test-section-icon-tiles pnpm test
```

Expected: focused tests, typecheck, lint, diff check, and the full suite pass.

- [ ] **Step 6: Verify the live Home page**

At `http://localhost:5211/`, confirm:

- visible section icons use 40px soft-accent tiles,
- title and subtitle stack to the tile's right,
- Show all remains aligned at the far right,
- divider placement and first-row spacing remain unchanged,
- narrow layout retains readable text without control overlap.

- [ ] **Step 7: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "refine: add home section icon tiles"
```
