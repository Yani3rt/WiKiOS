# Berry Secondary Accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Berry as a shared secondary accent and use it for restrained, non-semantic emphasis on Stats.

**Architecture:** Define stable strong and soft Berry tokens in the global `:root` block, outside the three theme presets. Expose one reusable secondary chip style and replace Stats' decorative warning-amber accents while leaving theme accents, focus, semantic states, and graph data encodings unchanged.

**Tech Stack:** React 19, TypeScript 5, Tailwind CSS 4 utilities, CSS custom properties in OKLCH, Vitest, pnpm.

## Global Constraints

- Use `pnpm` for project commands.
- Do not add a production dependency.
- Do not preserve unused color aliases solely for backward compatibility.
- Keep Teal, Blue, and Violet as the primary theme colors.
- Berry strong is exactly `oklch(0.48 0.12 345)` and Berry soft is exactly `oklch(0.92 0.03 345)`.
- Do not use Berry for focus, selection, success, warning, error, or graph data encodings.
- Preserve WCAG 2.2 AA contrast.

---

### Task 1: Lock the Berry color contract

**Files:**
- Modify: `tests/unified-color-system.test.ts`
- Test: `tests/unified-color-system.test.ts`

**Interfaces:**
- Consumes: production source text through the existing `source()` test helper.
- Produces: regression coverage for `--brand-secondary-accent`, `--brand-secondary-accent-soft`, `.chip-secondary`, and Stats' allowed accent tokens.

- [ ] **Step 1: Write the failing source-level test**

Add a test that requires:

```ts
expect(styles).toContain("--brand-secondary-accent: oklch(0.48 0.12 345);");
expect(styles).toContain("--brand-secondary-accent-soft: oklch(0.92 0.03 345);");
expect(styles).toMatch(
  /\.chip-secondary\s*\{[^}]*background:\s*var\(--brand-secondary-accent-soft\);[^}]*color:\s*var\(--brand-secondary-accent\);/u,
);
expect(statsSource).toContain('accent: "var(--brand-secondary-accent)"');
expect(statsSource).toContain('className="chip-secondary');
expect(statsSource).not.toContain('accent: "var(--brand-warning)"');
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts`

Expected: FAIL because the Berry tokens and `.chip-secondary` do not exist and Stats still uses warning amber decoratively.

- [ ] **Step 3: Commit the failing test with the implementation in Task 2**

Do not commit a deliberately red main branch; include this test in the Task 2 commit after it passes.

---

### Task 2: Add and apply the shared secondary accent

**Files:**
- Modify: `src/client/globals.css`
- Modify: `src/client/routes/stats-route.tsx`
- Test: `tests/unified-color-system.test.ts`

**Interfaces:**
- Consumes: global CSS custom properties and the Stats card/bar accent arrays.
- Produces: `--brand-secondary-accent`, `--brand-secondary-accent-soft`, and `.chip-secondary`.

- [ ] **Step 1: Define the global Berry tokens**

Add these values beside the stable semantic tokens in `:root`:

```css
--brand-secondary-accent: oklch(0.48 0.12 345);
--brand-secondary-accent-soft: oklch(0.92 0.03 345);
```

- [ ] **Step 2: Add the reusable chip treatment**

Replace the unused `.chip-lavender` rule with:

```css
.chip-secondary {
  border: 1px solid var(--brand-border);
  background: var(--brand-secondary-accent-soft);
  color: var(--brand-secondary-accent);
}
```

- [ ] **Step 3: Apply Berry to Stats secondary emphasis**

Change the Avg. Words card and third bar accent from
`var(--brand-warning)` to `var(--brand-secondary-accent)`. Change the Stats
eyebrow from `.chip-teal` to `.chip-secondary` and its dot to
`var(--brand-secondary-accent)`.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run tests/unified-color-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/client/globals.css src/client/routes/stats-route.tsx tests/unified-color-system.test.ts
git commit -m "feat: add berry secondary accent"
```

---

### Task 3: Verify regression safety

**Files:**
- Verify: `src/client/globals.css`
- Verify: `src/client/routes/stats-route.tsx`
- Verify: `tests/unified-color-system.test.ts`

**Interfaces:**
- Consumes: the complete application and test configuration.
- Produces: evidence that the token-only visual change is production-safe.

- [ ] **Step 1: Run static verification**

Run: `pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Inspect the finished diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the intended implementation and plan documents are present before their commits.

