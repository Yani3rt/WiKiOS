// @vitest-environment jsdom
import {act, useRef} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {findNoteRanges, FindInNote} from '../src/components/find-in-note';
let container: HTMLDivElement, root: Root;
const highlights = new Map();
function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return <><FindInNote readerRef={ref} noteKey="alpha"/><div ref={ref}><div className="workspace-reader"><h1>Alpha</h1><p>A <strong>connected</strong> idea. Another connected idea.</p><p>[literal].</p></div></div></>;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('CSS', {highlights});
  vi.stubGlobal('Highlight', class extends Set {constructor(...ranges: Range[]) {super(ranges);}});
  Range.prototype.getBoundingClientRect = () => ({top:10} as DOMRect);
  HTMLElement.prototype.scrollTo = vi.fn();
  highlights.clear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness/>));
});
afterEach(async () => {await act(async () => root.unmount());container.remove();vi.unstubAllGlobals();});
async function search(value: string) {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Find in note"]')!.click());
  const input = container.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles:true}));
  });
  return input;
}
it('matches across inline markup, case-insensitively, without changing note DOM', () => {
  const note = container.querySelector<HTMLElement>('.workspace-reader')!;
  const before = note.innerHTML;
  expect(findNoteRanges(note, 'CONNECTED idea').map(range => range.toString())).toEqual(['connected idea', 'connected idea']);
  expect(note.innerHTML).toBe(before);
  expect(findNoteRanges(note, '[literal]').map(range => range.toString())).toEqual(['[literal]']);
  expect(findNoteRanges(note, '   ')).toEqual([]);
});
it('shows counts, navigates and wraps matches with Enter and Shift+Enter', async () => {
  const input = await search('connected idea');
  expect(container.querySelector('output')?.textContent).toBe('1 / 2');
  expect(highlights.get('note-find').size).toBe(2);
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true})));
  expect(container.querySelector('output')?.textContent).toBe('2 / 2');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true})));
  expect(container.querySelector('output')?.textContent).toBe('1 / 2');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',shiftKey:true,bubbles:true})));
  expect(container.querySelector('output')?.textContent).toBe('2 / 2');
});
it('cleans up highlights and restores trigger focus on Escape', async () => {
  const input = await search('Alpha');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true})));
  expect(container.querySelector('input')).toBeNull();
  expect(highlights.get('note-find')?.size ?? 0).toBe(0);
  expect(document.activeElement).toBe(container.querySelector('[aria-label="Find in note"]'));
});
it('disables navigation when no text matches', async () => {
  await search('missing');
  expect(container.querySelector('output')?.textContent).toBe('0 / 0');
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next match"]')!.disabled).toBe(true);
});
it('opens via Ctrl+F and removes highlight registrations on unmount', async () => {
  const event = new KeyboardEvent('keydown', {key:'f',ctrlKey:true,bubbles:true,cancelable:true});
  await act(async () => document.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(container.querySelector('input'));
  await act(async () => root.render(<div/>));
  expect(highlights.size).toBe(0);
});
