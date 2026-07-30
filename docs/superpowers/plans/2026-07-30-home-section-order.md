# Home Section Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Recently updated, Recently visited, People, and Highly connected the universal Home section order across desktop and mobile.

**Architecture:** Keep the existing config-driven `HomepageContent` renderer and midpoint column split. Change the canonical section-key order, then protect the resulting DOM and responsive reading order with focused Homepage tests, including the empty-People case.

**Tech Stack:** React, TypeScript, Vitest, React DOM server rendering

## Global Constraints

- Apply the order as the WikiOS default everywhere.
- Preserve configurable `homepage.sectionOrder` overrides.
- Preserve unrelated working-tree changes.
- Add no production dependencies.
- Prefer `pnpm` for verification commands.

---

## File Structure

- Modify: `src/lib/wiki-config.ts` — define the universal canonical Home section order.
- Modify: `tests/homepage.test.tsx` — verify populated and empty-People section order.

### Task 1: Reorder Home sections universally

**Files:**
- Modify: `src/lib/wiki-config.ts:1-6`
- Test: `tests/homepage.test.tsx:57-146`

**Interfaces:**
- Consumes: `HOMEPAGE_SECTION_KEYS` as the source for `HomepageSectionKey`, the default `homepage.sectionOrder`, and config validation.
- Produces: default order `["recentPages", "featured", "people", "topConnected"]`.

- [ ] **Step 1: Write failing populated-order assertions**

In `renders named browse landmarks and caps each initial list`, add:

```ts
const recentlyUpdatedIndex = markup.indexOf('aria-labelledby="home-recentPages-heading"');
const recentlyVisitedIndex = markup.indexOf('aria-labelledby="home-featured-heading"');
const peopleIndex = markup.indexOf('aria-labelledby="home-people-heading"');
const highlyConnectedIndex = markup.indexOf('aria-labelledby="home-topConnected-heading"');

expect(recentlyUpdatedIndex).toBeGreaterThanOrEqual(0);
expect(recentlyVisitedIndex).toBeGreaterThan(recentlyUpdatedIndex);
expect(peopleIndex).toBeGreaterThan(recentlyVisitedIndex);
expect(highlyConnectedIndex).toBeGreaterThan(peopleIndex);
```

- [ ] **Step 2: Write failing empty-People assertions**

In `keeps Recently visited useful before a note has been opened`, add:

```ts
const recentlyUpdatedIndex = markup.indexOf('aria-labelledby="home-recentPages-heading"');
const recentlyVisitedIndex = markup.indexOf('aria-labelledby="home-featured-heading"');
const highlyConnectedIndex = markup.indexOf('aria-labelledby="home-topConnected-heading"');

expect(markup).not.toContain('aria-labelledby="home-people-heading"');
expect(recentlyUpdatedIndex).toBeGreaterThanOrEqual(0);
expect(recentlyVisitedIndex).toBeGreaterThan(recentlyUpdatedIndex);
expect(highlyConnectedIndex).toBeGreaterThan(recentlyVisitedIndex);
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because the current default begins with `featured` and places `topConnected` before `people` and `recentPages`.

- [ ] **Step 4: Change the canonical default order**

Replace the declaration at the top of `src/lib/wiki-config.ts` with:

```ts
export const HOMEPAGE_SECTION_KEYS = [
  "recentPages",
  "featured",
  "people",
  "topConnected",
] as const;
```

Do not hard-code column membership in `HomepageContent`; its existing filtering and midpoint split already produce the approved desktop and mobile sequence.

- [ ] **Step 5: Run focused and static verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
```

Expected: all commands pass.

- [ ] **Step 6: Commit only the implementation files**

```bash
git add src/lib/wiki-config.ts tests/homepage.test.tsx
git commit -m "feat: reorder home knowledge sections"
```

Do not stage unrelated pre-existing changes in `src/client/routes/explorer-route.tsx` or `tests/explorer-model.test.ts`.
