# Home People Row Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center People names beside their avatars and move backlink counts into trailing pills followed by chevrons.

**Architecture:** Restructure only `PersonRow` using the pill classes already established by `ConnectedPageRow`. Add explicit People-row markers for stable server-rendered regression assertions.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Vitest

## Global Constraints

- Keep avatars left and names vertically centered beside them.
- Use the same backlink pill treatment as Highly connected.
- Place a decorative ChevronRight immediately after each pill.
- Preserve hover and navigation behavior.
- Add no production dependencies.

---

### Task 1: Restructure People rows

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Modifies: existing `PersonRow({ person }: { person: PageSummary })`
- Reuses: existing imported `ChevronRight`

- [ ] **Step 1: Write failing People-row markup assertions**

In the populated Homepage test, add:

```ts
expect(markup).toContain('data-home-person-row="true"');
expect(markup).toContain('data-home-person-backlink-pill="true"');
expect(markup).toContain('data-home-person-chevron="true"');
expect(markup.match(/data-home-person-row="true"/gu)?.length).toBe(4);
expect(markup.match(/data-home-person-backlink-pill="true"/gu)?.length).toBe(4);
expect(markup.match(/data-home-person-chevron="true"/gu)?.length).toBe(4);
expect(markup).toContain(
  "min-w-0 flex-1 truncate text-[0.95rem] font-medium",
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because People rows do not yet have trailing pills, chevrons, or the new markers.

- [ ] **Step 3: Restructure PersonRow**

Keep the current avatar span unchanged. Replace the existing name/backlink stack with:

```tsx
<span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
  {person.title}
</span>
<span className="flex shrink-0 items-center gap-1.5">
  <span
    data-home-person-backlink-pill="true"
    className="shrink-0 rounded-full bg-[var(--home-accent-soft)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--home-accent)]"
  >
    {person.backlinkCount.toLocaleString()}{" "}
    {person.backlinkCount === 1 ? "backlink" : "backlinks"}
  </span>
  <ChevronRight
    aria-hidden="true"
    data-home-person-chevron="true"
    className="h-4 w-4 shrink-0 text-[var(--home-accent)]"
  />
</span>
```

Add `data-home-person-row="true"` to the existing Link. Keep its `items-center`, `gap-3`, and hover classes.

- [ ] **Step 4: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-people-row-layout
HOME=/private/tmp/wiki-os-test-people-row-layout pnpm test
```

Expected: focused tests, typecheck, lint, diff check, and the full suite pass.

- [ ] **Step 5: Verify the populated fixture**

Confirm server-rendered markup proves:

- avatar remains first,
- name is the flexible centered text,
- backlink pill follows the name,
- chevron follows the pill,
- four visible People rows receive the pattern.

If the live vault contains People, also verify the Home page visually; otherwise record the fixture-only limitation.

- [ ] **Step 6: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "refine: update people row actions"
```
