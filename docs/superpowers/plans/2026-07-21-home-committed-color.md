# Home Committed Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the Home page a noticeably more expressive teal identity by turning the header and search area into a solid deep-teal band while preserving the calm, search-first information architecture.

**Architecture:** Keep the existing `SearchBox` and `HomepageContent` component boundaries. Introduce a Home-only OKLCH token set in `globals.css`, split the search band from the light results/discovery canvas in `SearchBox`, and use the existing Lucide dependency for restrained destination icon wells. Preserve all search, refresh, progressive-disclosure, and routing behavior.

**Tech Stack:** React 19, React Router, Tailwind CSS utility classes, CSS custom properties, Lucide React, Vitest, ESLint, TypeScript.

## Global Constraints

- Do not add production dependencies.
- Use solid color only: no gradients, glass, glows, decorative side rails, or page-load animation.
- Limit the palette to teal plus semantic forest/rust feedback colors.
- Keep body text at WCAG AA contrast and interactive boundaries/focus indicators at least 3:1.
- Preserve all existing Home search, refresh, empty/error, and progressive-disclosure behavior.

---

## Task 1: Lock the committed-color contract with a failing test

**Files:**
- Modify: `tests/homepage.test.tsx`
- Verify: `src/components/search-box.tsx`
- Verify: `src/client/globals.css`

- [x] Add a source-level test that requires a `.home-hero` wrapper, three restrained destination icon wells, OKLCH Home tokens, and the absence of rejected gradient/glass treatments in the Home-specific implementation.
- [x] Run `pnpm test -- tests/homepage.test.tsx` and confirm the new assertion fails before implementation.

## Task 2: Build the deep-teal search band and navigation bridge

**Files:**
- Modify: `src/components/search-box.tsx`
- Modify: `src/components/homepage-content.tsx`
- Modify: `src/client/globals.css`
- Test: `tests/homepage.test.tsx`

- [x] Import existing Lucide icons for Browse, Graph, and Stats destinations.
- [x] Refactor `SearchBox` so the brand header, intro, search field, refresh action, shortcut, and refresh status live inside a semantic `.home-hero` band.
- [x] Keep query results on the light canvas beneath the band and preserve their accessible states.
- [x] Place the three destination links at the hero/canvas boundary with one teal icon well per destination.
- [x] Change discovery section headings to the main Home accent color.
- [x] Replace Home HEX/RGB tokens with a compact OKLCH palette for the hero, canvas, surfaces, text, borders, focus, and semantic feedback states.
- [x] Add forced-colors support for the hero/icon wells without adding decorative effects.
- [x] Run `pnpm test -- tests/homepage.test.tsx` and confirm the focused suite passes.

## Task 3: Verify accessibility and regression safety

**Files:**
- Verify: `src/components/search-box.tsx`
- Verify: `src/components/homepage-content.tsx`
- Verify: `src/client/globals.css`
- Verify: `tests/homepage.test.tsx`

- [x] Calculate contrast for every Home foreground/background pair used in the hero and light canvas; adjust tokens if any body pair is below 4.5:1 or any UI boundary is below 3:1.
- [x] Run the deterministic design detector against `src/components/search-box.tsx` and resolve any new Home-specific warning.
- [x] Run `pnpm lint`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
- [x] Inspect `git diff --check` and `git status --short` before reporting completion.
