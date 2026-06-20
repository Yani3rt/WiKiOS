# Code Block Language Label Design

## Goal

Show the declared fenced-code language in the top-right corner of rendered code blocks. Untagged code blocks remain unlabeled.

## Chosen approach

Add a custom ReactMarkdown `pre` renderer in the shared `NoteViewer`. The renderer inspects its code child for the existing `language-*` class produced from the Markdown fence, extracts the language name, and renders a small visual label before the code content.

This keeps language detection at the rendering boundary, avoids Markdown preprocessing, and does not add a dependency. Both Wiki and Explorer routes inherit the behavior through the shared viewer.

## Presentation

- Position the label in the code block's top-right corner.
- Render labels in uppercase with subdued contrast and compact typography.
- Add extra top padding only to labeled blocks so the label cannot overlap code.
- Do not render any label or extra label spacing when the fence has no language.
- Mark the label as decorative so it does not add noise for assistive technology.

## Testing

- Render a language-tagged fenced block and assert that its language label is present.
- Render an untagged fenced block and assert that no label is present.
- Verify existing note viewer tests, TypeScript checks, and lint remain green.
