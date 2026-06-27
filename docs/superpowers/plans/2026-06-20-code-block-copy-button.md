# Code Block Copy Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal `Copy` / `Copied` button to shared fenced code blocks so readers can copy raw code from Wiki and Explorer notes.

**Architecture:** Extend the shared `NoteViewer` code-block renderer with a small toolbar-aware wrapper that extracts raw code text from the nested code child. A clipboard helper performs the write, and the renderer briefly toggles button text to `Copied` after success. Shared CSS positions the button alongside the existing language label and reserves top padding for all fenced blocks.

**Tech Stack:** React 19, ReactMarkdown, TypeScript, Tailwind-backed global CSS, Vitest SSR/unit tests

---

### Task 1: Add copy-button coverage before implementation

**Files:**
- Modify: `tests/shared-note-viewer.test.ts`
- Modify: `src/components/note-viewer.tsx`

- [ ] **Step 1: Write failing rendering and helper tests**

Add tests that render one fenced block and assert the SSR markup includes `aria-label="Copy code"` and `>Copy<`. Add a pure helper test for raw code extraction and clipboard forwarding, for example by importing `copyCodeBlockText` and calling it with a stub writer.

- [ ] **Step 2: Run the targeted test file and verify it fails**

Run:

```bash
pnpm test tests/shared-note-viewer.test.ts
```

Expected: FAIL because the copy button markup and/or exported copy helper do not exist yet.

### Task 2: Implement the shared copy button

**Files:**
- Modify: `src/components/note-viewer.tsx`
- Modify: `src/client/globals.css`

- [ ] **Step 1: Add raw code extraction and clipboard helpers**

In `src/components/note-viewer.tsx`, add a helper that finds the nested code child and recursively extracts its text content, plus an exported async helper that accepts a `writeText` function and code string and forwards the text.

- [ ] **Step 2: Add a dedicated code-block renderer component**

Replace the inline `pre` renderer body with a small React component that:
- derives `language` and `codeText`
- renders a top-left `Copy` button
- calls the clipboard helper on click
- temporarily changes the text to `Copied` after a successful copy
- preserves the existing top-right language label when present

- [ ] **Step 3: Add minimal toolbar styling**

Update `src/client/globals.css` so fenced blocks reserve top space for the toolbar, position the copy button in the top-left, keep it subtle, and preserve the existing code surface/background behavior.

### Task 3: Verify the full change

**Files:**
- Modify: `tests/shared-note-viewer.test.ts`
- Modify: `src/components/note-viewer.tsx`
- Modify: `src/client/globals.css`

- [ ] **Step 1: Run targeted verification**

```bash
pnpm test tests/shared-note-viewer.test.ts
```

Expected: PASS with the new copy-button coverage.

- [ ] **Step 2: Run project verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all commands exit successfully.
