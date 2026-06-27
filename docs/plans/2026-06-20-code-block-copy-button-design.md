# Code Block Copy Button Design

## Goal

Add a minimal text copy button to fenced code blocks that lets readers copy the raw code to the clipboard.

## Chosen approach

Extend the shared ReactMarkdown `pre` renderer in `NoteViewer` so each fenced block renders a small toolbar with a top-left `Copy` button and the existing top-right language label when present. The renderer extracts the raw code text from the nested code child and passes it to a clipboard helper on click.

This keeps the behavior shared between Wiki and Explorer, avoids adding dependencies, and fits naturally into the current custom code-block shell.

## Presentation

- Show a small text button in the top-left corner of every fenced code block.
- Default button text is `Copy`; successful click changes it to `Copied` briefly, then resets.
- Keep the control subtle and compact so it does not dominate the code block.
- Preserve the existing top-right language label for tagged fences.
- Reserve top padding in fenced blocks so controls never overlap code.

## Behavior

- Copy the raw rendered code text, not the language label.
- If the Clipboard API is unavailable, fail safely without breaking rendering.
- Only fenced code blocks get the button; inline code remains unchanged.

## Testing

- Render a fenced block and assert the `Copy` button appears in SSR markup.
- Assert the extracted code text helper returns the raw code contents.
- Assert the copy helper forwards the raw code string to the clipboard writer.
- Verify `pnpm test`, `pnpm typecheck`, and `pnpm lint` remain green.
