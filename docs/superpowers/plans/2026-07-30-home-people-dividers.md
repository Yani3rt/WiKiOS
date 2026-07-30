# Home People Divider Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove horizontal dividers from People rows without changing their spacing or behavior.

**Architecture:** Reuse the existing `HomeSection` `showDividers` prop and opt the People section out. Add a server-rendered regression assertion that scopes the change to People.

**Tech Stack:** React, TypeScript, Vitest

## Global Constraints

- Change only the People section divider treatment.
- Preserve all existing People row layout and behavior.
- Add no production dependencies.

---

### Task 1: Remove People dividers

**Files:**
- Modify: `src/components/homepage-content.tsx`
- Test: `tests/homepage.test.tsx`

**Interfaces:**
- Uses: existing `HomeSection` prop `showDividers?: boolean`

- [ ] **Step 1: Write the failing markup assertion**

In the populated Homepage test, extract the People list opening tag:

```ts
const peopleListTag =
  markup.match(/<ul id="home-people-list"[^>]*>/u)?.[0] ?? "";
expect(peopleListTag).not.toContain("divide-y");
```

Keep the existing Recently updated assertion proving another section still contains `divide-y`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because `home-people-list` still contains `divide-y`.

- [ ] **Step 3: Disable People dividers**

Add the existing prop to the People `HomeSection`:

```tsx
showDividers={false}
```

Do not change `PersonRow` classes or markup.

- [ ] **Step 4: Run focused and repository verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-people-dividers
HOME=/private/tmp/wiki-os-test-people-dividers pnpm test
```

Expected: focused tests, typecheck, lint, diff check, and the full suite pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "refine: remove people row dividers"
```
