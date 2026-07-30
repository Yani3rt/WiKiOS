# Home Section Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a distinct accessible-by-context outline icon to every Home knowledge-section heading.

**Architecture:** Extend the reusable `HomeSection` component with a decorative `icon` prop. Each section view supplies one existing Lucide icon, while `HomeSection` owns the shared heading alignment and keeps the icon hidden from assistive technology.

**Tech Stack:** React, TypeScript, `lucide-react`, Vitest, React DOM server rendering

## Global Constraints

- Use the existing `lucide-react` dependency.
- Add no production dependencies.
- Preserve unrelated working-tree changes.
- Keep section copy and responsive behavior unchanged.
- Prefer `pnpm` for verification commands.

---

## File Structure

- Modify: `src/components/homepage-content.tsx` — import, assign, and render semantic section icons.
- Modify: `tests/homepage.test.tsx` — verify all icon assignments and conditional People behavior.

### Task 1: Add semantic outline icons to Home section headings

**Files:**
- Modify: `src/components/homepage-content.tsx:1-145`
- Test: `tests/homepage.test.tsx:57-175`

**Interfaces:**
- Consumes: existing `HomeSection` props and `lucide-react` components `FileClock`, `Eye`, `Users`, and `Network`.
- Produces: `HomeSection` prop `icon: ReactNode` and decorative SVGs rendered beside headings.

- [ ] **Step 1: Write failing populated-section icon assertions**

In `renders named browse landmarks and caps each initial list`, add:

```ts
expect(markup).toContain("lucide-file-clock");
expect(markup).toContain("lucide-eye");
expect(markup).toContain("lucide-users");
expect(markup).toContain("lucide-network");
expect(markup.match(/aria-hidden="true"/gu)?.length ?? 0).toBeGreaterThanOrEqual(4);
```

- [ ] **Step 2: Write the conditional People icon assertion**

In `keeps Recently visited useful before a note has been opened`, add:

```ts
expect(markup).not.toContain("lucide-users");
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
```

Expected: FAIL because `HomepageContent` does not yet render Lucide section icons.

- [ ] **Step 4: Import the approved icons**

At the top of `src/components/homepage-content.tsx`, add:

```ts
import { Eye, FileClock, Network, Users } from "lucide-react";
```

- [ ] **Step 5: Add and render the generic icon prop**

Add `icon` to the `HomeSection` arguments and type:

```ts
function HomeSection({
  sectionKey,
  title,
  description,
  itemCount,
  expanded,
  onToggle,
  icon,
  children,
}: {
  sectionKey: HomepageSectionKey;
  title: string;
  description: string;
  itemCount: number;
  expanded: boolean;
  onToggle: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
```

Replace the standalone heading with:

```tsx
<div className="flex items-center gap-2">
  {icon}
  <h2
    id={headingId}
    className="text-lg font-semibold leading-6 tracking-[-0.01em] text-[var(--home-accent)]"
  >
    {title}
  </h2>
</div>
```

- [ ] **Step 6: Assign icons to all four sections**

Pass these props to the matching `HomeSection` calls:

```tsx
icon={<Eye aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--home-accent)]" />}
```

for `featured`, then:

```tsx
icon={<Network aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--home-accent)]" />}
```

for `topConnected`, then:

```tsx
icon={<Users aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--home-accent)]" />}
```

for `people`, and:

```tsx
icon={<FileClock aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--home-accent)]" />}
```

for `recentPages`.

- [ ] **Step 7: Run focused and static verification**

Run:

```bash
pnpm exec vitest run tests/homepage.test.tsx
pnpm run typecheck
pnpm run lint
git diff --check
```

Expected: all commands pass.

- [ ] **Step 8: Commit only the implementation files**

```bash
git add src/components/homepage-content.tsx tests/homepage.test.tsx
git commit -m "feat: add icons to home sections"
```

Do not stage unrelated pre-existing changes in `src/client/routes/explorer-route.tsx` or `tests/explorer-model.test.ts`.
