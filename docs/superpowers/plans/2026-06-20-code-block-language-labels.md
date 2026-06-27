# Code Block Language Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a subtle top-right language label on language-tagged fenced code blocks while leaving untagged blocks unlabeled.

**Architecture:** Extend the shared ReactMarkdown component map with a custom `pre` renderer. It extracts the `language-*` class from its code child, conditionally renders a decorative label, and applies a labeled-block class that CSS uses for positioning and collision-free spacing.

**Tech Stack:** React 19, ReactMarkdown, TypeScript, Tailwind-backed global CSS, Vitest server rendering

---

### Task 1: Render and style conditional code-language labels

**Files:**
- Modify: `tests/shared-note-viewer.test.ts`
- Modify: `src/components/note-viewer.tsx`
- Modify: `src/client/globals.css`

- [ ] **Step 1: Write the failing rendering test**

Add a test page containing one `bash` fence and one untagged fence, render `NoteViewer`, and assert that exactly one language label is present:

```ts
it("labels tagged code blocks and leaves untagged blocks unlabeled", () => {
  const codePage: WikiPageData = {
    ...samplePage,
    contentMarkdown: "```bash\ngit status\n```\n\n```\ngit branch -d\n```",
    hasCodeBlocks: true,
    headings: [],
  };
  const markup = renderToStaticMarkup(
    createElement(
      WikiConfigProvider as never,
      { config: DEFAULT_WIKI_OS_CONFIG },
      createElement(
        MemoryRouter,
        undefined,
        createElement(NoteViewer, { page: codePage, onNavigateNote: () => {} }),
      ),
    ),
  );

  expect(markup.match(/data-code-language=/gu)).toHaveLength(1);
  expect(markup).toContain('data-code-language="bash"');
  expect(markup).toContain(">BASH</span>");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test tests/shared-note-viewer.test.ts
```

Expected: FAIL because `data-code-language="bash"` is absent.

- [ ] **Step 3: Add language extraction and the custom pre renderer**

In `src/components/note-viewer.tsx`, import `Children` from React and add this helper near the existing Markdown helpers:

```tsx
function codeBlockLanguage(children: ReactNode) {
  const codeChild = Children.toArray(children).find(isValidElement);
  if (!isValidElement<{ className?: string }>(codeChild)) return null;

  return codeChild.props.className?.match(/(?:^|\s)language-([^\s]+)/u)?.[1] ?? null;
}
```

Add this entry to `markdownComponents`:

```tsx
pre: ({ node, children, className, ...props }) => {
  void node;
  const language = codeBlockLanguage(children);
  return (
    <pre
      {...props}
      className={[className, language ? "code-block-has-language" : null]
        .filter(Boolean)
        .join(" ") || undefined}
    >
      {language ? (
        <span
          aria-hidden="true"
          className="code-language-label"
          data-code-language={language}
        >
          {language.toUpperCase()}
        </span>
      ) : null}
      {children}
    </pre>
  );
},
```

- [ ] **Step 4: Style the label and reserve space only when needed**

Update `src/client/globals.css`:

```css
.prose-wiki pre {
  position: relative;
}

.prose-wiki pre.code-block-has-language {
  padding-top: 2.75rem;
}

.code-language-label {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  color: rgba(201, 209, 217, 0.65);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1;
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 5: Run targeted verification**

Run:

```bash
pnpm test tests/shared-note-viewer.test.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit successfully and all shared note viewer tests pass.

- [ ] **Step 6: Verify the rendered example**

Refresh `http://localhost:5211/explorer/02%20cheat-sheet/git-command-cheatsheet` and confirm:

- Bash-tagged blocks show `BASH` in the top-right corner.
- Untagged blocks show no label.
- Neither label nor extra spacing overlaps code.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/note-viewer.tsx src/client/globals.css tests/shared-note-viewer.test.ts
git commit -m "feat: label code block languages"
```
