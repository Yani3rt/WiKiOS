# Unified Teal Color System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the approved Home OKLCH teal system across every user-facing WikiOS route while preserving each route's behavior, responsive layout, and meaningful data colors.

**Architecture:** Promote the Home palette into global brand tokens, alias existing Home/Explorer/Graph tokens to the shared system, and add composable route-shell/header/control classes. Apply those classes route by route, then simplify command-palette and setup treatments that conflict with the approved no-gradient/no-glass direction. No data or routing interfaces change.

**Tech Stack:** React 19, React Router, Tailwind CSS utility classes, CSS custom properties, Lucide React, Vitest, ESLint, TypeScript.

## Global Constraints

- Do not add production dependencies.
- Do not change route loaders, API contracts, search, graph behavior, setup behavior, or note rendering.
- Keep Graph category and relationship colors because they encode data.
- Use OKLCH for new shared colors.
- No gradients, glass, backdrop blur, glows, colored side rails, or decorative page-load motion on affected surfaces.
- Maintain WCAG 2.2 AA contrast and forced-colors support.

---

## Task 1: Define the cross-route color contract with failing tests

**Files:**
- Create: `tests/unified-color-system.test.ts`
- Verify: `src/client/globals.css`
- Verify: `src/client/routes/explorer-route.tsx`
- Verify: `src/client/routes/graph-route.tsx`
- Verify: `src/client/routes/stats-route.tsx`
- Verify: `src/client/routes/wiki-route.tsx`
- Verify: `src/client/routes/setup-route.tsx`
- Verify: `src/components/error-state-view.tsx`
- Verify: `src/components/not-found-view.tsx`

- [x] Add source-level assertions for global OKLCH brand tokens and reusable route shell/header classes.
- [x] Require every user-facing route and fallback state to adopt the shared shell or header contract.
- [x] Require Setup to remove gradient decoration and the command palette to remove glass, gradient selection, and colored side rails.
- [x] Run `pnpm exec vitest run tests/unified-color-system.test.ts` and confirm the new contract fails before implementation.

## Task 2: Promote Home colors into a shared system

**Files:**
- Modify: `src/client/globals.css`
- Test: `tests/unified-color-system.test.ts`
- Test: `tests/homepage.test.tsx`

- [x] Add global `--brand-*` OKLCH tokens for deep teal, light ink, teal canvas, surface, ink, muted ink, accent, soft accent, boundaries, focus, success, error, and warning.
- [x] Alias Home tokens to the new shared brand tokens without changing its approved appearance.
- [x] Add composable `.app-route-shell`, `.app-route-header`, `.app-route-header-brand`, `.app-route-header-control`, `.app-primary-action`, and `.app-secondary-action` classes.
- [x] Add light- and dark-surface focus rules plus forced-colors fallbacks.
- [x] Run the Home and unified-color focused tests.

## Task 3: Colorize Explorer and Graph utility workspaces

**Files:**
- Modify: `src/client/routes/explorer-route.tsx`
- Modify: `src/client/routes/graph-route.tsx`
- Modify: `src/client/globals.css`
- Test: `tests/unified-color-system.test.ts`
- Test: `tests/explorer-model.test.ts`
- Test: `tests/graph-overview-model.test.ts`

- [x] Map Explorer canvas, surfaces, selection, borders, accent, focus, and scrollbar tokens to the shared teal system.
- [x] Apply the compact deep-teal masthead to Explorer while preserving desktop/mobile controls and drawer behavior.
- [x] Map Graph canvas, surfaces, controls, actions, focus, and panel chrome to teal while leaving category and relationship colors meaningful.
- [x] Apply the compact teal masthead to Graph without obscuring its canvas controls.
- [x] Run focused Explorer, Graph, and unified-color tests.

## Task 4: Colorize Stats and the Wiki reader

**Files:**
- Modify: `src/client/routes/stats-route.tsx`
- Modify: `src/client/routes/wiki-route.tsx`
- Modify: `src/components/note-viewer.tsx` only if shared classes cannot cover the reading accents
- Modify: `src/client/globals.css`
- Test: `tests/unified-color-system.test.ts`
- Test: `tests/shared-note-viewer.test.ts`

- [x] Apply the shared route shell and compact teal masthead to Stats and Wiki.
- [x] Replace Stats pastel cycling and glow decorations with teal-dominant values plus limited warning amber.
- [x] Use near-white reading surfaces and shared teal links, metadata, supporting panels, and focus indicators.
- [x] Preserve editorial reading typography and note navigation.
- [x] Run focused Stats/Wiki contract and shared note-viewer tests.

## Task 5: Colorize Setup, command palette, and fallback states

**Files:**
- Modify: `src/client/routes/setup-route.tsx`
- Modify: `src/components/command-palette.tsx` if class hooks are needed
- Modify: `src/components/error-state-view.tsx`
- Modify: `src/components/not-found-view.tsx`
- Modify: `src/client/globals.css`
- Test: `tests/unified-color-system.test.ts`
- Test: `tests/command-palette.test.ts`
- Test: `tests/setup-flow.test.ts`

- [x] Replace Setup's radial gradients with the shared teal canvas and masthead.
- [x] Apply shared primary/secondary actions and semantic success/error/warning surfaces without changing setup logic.
- [x] Make the command palette opaque and teal-led; remove backdrop blur, gradient selection, and its colored side rail.
- [x] Apply the shared shell, teal emphasis, and primary action to 404 and route-error states.
- [x] Run focused unified-color, command-palette, and setup tests.

## Task 6: Verify accessibility and regression safety

**Files:**
- Verify all files above.

- [x] Calculate representative dark-header, light-canvas, control-boundary, selection, semantic-state, and action contrast pairs.
- [x] Run the deterministic design detector on affected route and CSS files; resolve new cross-route findings and document unrelated pre-existing findings.
- [x] Run `pnpm lint`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test` in its own command.
- [x] Run `pnpm build` in its own command.
- [x] Run `git diff --check` and inspect `git status --short`.
- [x] Attempt desktop/mobile browser inspection only if the existing browser session is available; do not bypass a locked shared browser profile.
