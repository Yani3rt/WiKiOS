# Home Recently Updated Summary Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every Recently updated summary as an exact 30-character preview with a leading chevron and conditional ellipsis.

**Architecture:** Add a pure exported summary-preview helper beside the existing Homepage helpers, then use it only in `PageRow` when `showSummary` is enabled. Preserve the full summary in a tooltip and keep the chevron decorative.

**Tech Stack:** React, TypeScript, Lucide React, Vitest

## Global Constraints

- Count spaces toward the 30-character limit.
- Append `...` only when the summary exceeds 30 characters.
- Apply the chevron treatment to every rendered Recently updated preview.
- Add no production dependencies.

---

### Task 1: Add exact Recently updated previews

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Produces: `getHomeSummaryPreview(summary: string, maximumLength?: number): string`
- Uses: existing `PageRow({ page, showSummary })`

- [ ] **Step 1: Write failing helper and markup tests**

Import `getHomeSummaryPreview` and add:

```ts
expect(getHomeSummaryPreview("Short summary")).toBe("Short summary");
expect(getHomeSummaryPreview("123456789012345678901234567890")).toBe(
  "123456789012345678901234567890",
);
expect(getHomeSummaryPreview("1234567890123456789012345678901")).toBe(
  "123456789012345678901234567890...",
);
expect(getHomeSummaryPreview("")).toBe("");
```

In the populated Homepage markup assertions, verify:

```ts
expect(markup).toContain("lucide-chevron-right");
expect(markup).toContain('data-home-summary-preview="true"');
expect(markup).toContain('title="Summary for note 1"');
```

Add a long summary fixture and assert its exact visible output:

```ts
pages[0] = {
  ...pages[0],
  summary: "systemctl --user restart hermes-dashboard.service",
};
expect(markup).toContain("systemctl --user restart herme...");
expect(markup).not.toContain(
  ">systemctl --user restart hermes-dashboard.service<",
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because `getHomeSummaryPreview`, the chevron, and preview markup do not exist.

- [ ] **Step 3: Add the pure preview helper**

In `src/components/homepage-content.tsx`, add:

```ts
export function getHomeSummaryPreview(summary: string, maximumLength = 30) {
  if (summary.length <= maximumLength) return summary;
  return `${summary.slice(0, maximumLength)}...`;
}
```

- [ ] **Step 4: Render the preview treatment**

Import `ChevronRight` from `lucide-react`. Replace the existing summary span in `PageRow` with:

```tsx
<span
  title={page.summary}
  data-home-summary-preview="true"
  className="mt-1 flex min-w-0 items-center gap-1 text-sm leading-5 text-[var(--home-muted)]"
>
  <ChevronRight
    aria-hidden="true"
    className="h-3.5 w-3.5 shrink-0 text-[var(--home-accent)]"
  />
  <span className="min-w-0 truncate">
    {getHomeSummaryPreview(page.summary)}
  </span>
</span>
```

Keep the existing `showSummary && page.summary` condition so empty or missing summaries render nothing.

- [ ] **Step 5: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-summary-preview
HOME=/private/tmp/wiki-os-test-summary-preview pnpm test
```

Expected: focused tests, typecheck, lint, diff check, and the full suite pass.

- [ ] **Step 6: Verify the live Home page**

At `http://localhost:5211/`, verify:

- every visible Recently updated summary begins with a chevron,
- the Hermes preview is exactly 30 characters plus `...`,
- short previews do not receive unnecessary ellipses,
- the full summary appears as the native tooltip,
- row hover behavior remains unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "feat: compact recent note summaries"
```
