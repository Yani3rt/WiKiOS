// @vitest-environment jsdom
import {act,useRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NotePreview,previewExcerpt} from "../src/components/note-preview";
let root:Root,container:HTMLDivElement,touch:boolean;
const open=vi.fn(),navigate=vi.fn(),fetchMock=vi.fn();
function Harness(){const ref=useRef<HTMLDivElement>(null);return <div ref={ref}><button data-note-slug="Notes/Beta" onClick={navigate}><span>Beta</span><svg aria-hidden="true"><path/></svg></button><a href="/wiki/Notes/Other%2520note">Other</a><NotePreview rootRef={ref} onOpen={open} activeSlug="Alpha"/></div>;}
beforeEach(async()=>{
  vi.useFakeTimers();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);touch=false;open.mockReset();navigate.mockReset();
  vi.stubGlobal("matchMedia",()=>({matches:touch}));
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({slug:"Notes/Beta",title:"Beta",contentMarkdown:"# Beta\n\nA useful **idea** with [a link](/wiki/Alpha).",modifiedAt:1000}),{headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetchMock);container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root.render(<Harness/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function focus(){await act(async()=>container.querySelector<HTMLButtonElement>('[data-note-slug]')!.focus());await act(async()=>vi.advanceTimersByTimeAsync(751));}
it('waits before requesting a preview and renders plain text without navigating',async()=>{
  await act(async()=>container.querySelector<HTMLButtonElement>('[data-note-slug]')!.focus());
  expect(fetchMock).not.toHaveBeenCalled();await act(async()=>vi.advanceTimersByTimeAsync(751));
  expect(fetchMock).toHaveBeenCalledWith('/api/wiki/Notes/Beta',expect.anything());
  expect(container.querySelector('.note-peek-excerpt')?.textContent).toBe('A useful idea with a link.');expect(open).not.toHaveBeenCalled();
});
it('opens through the explicit action and dismisses the preview',async()=>{
  await focus();await act(async()=>container.querySelector<HTMLButtonElement>('.note-peek-open')!.click());
  expect(open).toHaveBeenCalledWith('Notes/Beta');expect(container.querySelector('[role="dialog"]')).toBeNull();
});
it('intercepts a mobile tap without triggering the original navigation',async()=>{
  touch=true;await act(async()=>container.querySelector<HTMLButtonElement>('[data-note-slug]')!.click());
  expect(navigate).not.toHaveBeenCalled();expect(container.querySelector('.note-peek-touch')).not.toBeNull();
});
it('Escape restores focus without reopening and clears the description',async()=>{
  await focus();await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Close note preview"]')!.focus());
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>vi.advanceTimersByTimeAsync(800));expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(container.querySelector('[data-note-slug]'));expect(document.activeElement?.hasAttribute('aria-describedby')).toBe(false);
});
it('skips headings and code in the opening excerpt',()=>{
  expect(previewExcerpt('# Title\n\n```js\ncode\n```\n\nOpening paragraph.\n\nSecond paragraph.')).toBe('Opening paragraph.');
});

async function pointer(node: Element, type: string, relatedTarget: EventTarget | null = null) {
  await act(async () => node.dispatchEvent(new MouseEvent(type, {bubbles:true, relatedTarget})));
}
it('keeps the dwell timer running across a note label and icon', async () => {
  const note = container.querySelector('[data-note-slug]')!;
  const label = note.querySelector('span')!, icon = note.querySelector('svg')!;
  await pointer(label, 'pointerover');
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(fetchMock).not.toHaveBeenCalled();
  await pointer(label, 'pointerout', icon);
  await pointer(icon, 'pointerover', label);
  await act(async () => vi.advanceTimersByTimeAsync(351));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await pointer(icon, 'pointerout', label);
  await pointer(label, 'pointerover', icon);
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
it('cancels quick pass-through hovers and requires a fresh dwell on re-entry', async () => {
  const note = container.querySelector('[data-note-slug]')!;
  await pointer(note, 'pointerover');
  await act(async () => vi.advanceTimersByTimeAsync(400));
  await pointer(note, 'pointerout');
  await act(async () => vi.advanceTimersByTimeAsync(800));
  expect(fetchMock).not.toHaveBeenCalled();
  await pointer(note, 'pointerover');
  await act(async () => vi.advanceTimersByTimeAsync(749));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(2));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
it('keeps the preview open when crossing the gap into its controls', async () => {
  await focus();
  const note = container.querySelector('[data-note-slug]')!;
  await pointer(note, 'pointerout');
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await pointer(container.querySelector('.note-peek-open')!, 'pointerover');
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it('keeps only an inert visual card during the short exit, then removes it', async () => {
  await focus();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close note preview"]')!.click());
  const leaving = container.querySelector('.note-peek');
  expect(leaving).not.toBeNull();
  expect(leaving?.getAttribute('aria-hidden')).toBe('true');
  expect(leaving?.hasAttribute('inert')).toBe(true);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(141));
  expect(container.querySelector('.note-peek')).toBeNull();
});
it('removes the card immediately for reduced motion', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'}));
  await focus();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close note preview"]')!.click());
  expect(container.querySelector('.note-peek')).toBeNull();
});
it('does not let an old exit timer remove a newly opened preview', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(hover: none)'}));
  const note = container.querySelector<HTMLButtonElement>('[data-note-slug]')!;
  await act(async () => note.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close note preview"]')!.click());
  await act(async () => vi.advanceTimersByTimeAsync(70));
  await act(async () => note.click());
  await act(async () => vi.advanceTimersByTimeAsync(150));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.querySelector('.note-peek')?.hasAttribute('inert')).toBe(false);
});

it('reuses the open card and switches to another note after 150ms', async () => {
  container.querySelector('a')!.getBoundingClientRect = () => ({left:100,top:180,bottom:220} as DOMRect);
  await focus();
  const card = container.querySelector('[role="dialog"]');
  const first = container.querySelector('[data-note-slug]')!;
  const next = container.querySelector('a')!;
  await pointer(first, 'pointerout', next);
  await pointer(next, 'pointerover', first);
  await act(async () => vi.advanceTimersByTimeAsync(149));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).toBe(card);
  await act(async () => vi.advanceTimersByTimeAsync(2));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toBe('/api/wiki/Notes/Other%252520note');
  expect((card as HTMLElement).style.translate).toBe('100px 228px');
  expect(container.querySelector('[role="dialog"]')).toBe(card);
});
it('keeps the card alive when keyboard focus moves between notes', async () => {
  await focus();
  const card = container.querySelector('[role="dialog"]');
  await act(async () => container.querySelector<HTMLAnchorElement>('a')!.focus());
  expect(container.querySelector('[role="dialog"]')).toBe(card);
  await act(async () => vi.advanceTimersByTimeAsync(151));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not switch while briefly passing over another note', async () => {
  await focus();
  const first = container.querySelector('[data-note-slug]')!;
  const next = container.querySelector('a')!;
  await pointer(first, 'pointerout', next);
  await pointer(next, 'pointerover', first);
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await pointer(next, 'pointerout', first);
  await pointer(first, 'pointerover', next);
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
it('does not cancel keyboard switching when scrolling re-enters the previous hovered row', async () => {
  await focus();
  const first = container.querySelector('[data-note-slug]')!;
  await act(async () => container.querySelector<HTMLAnchorElement>('a')!.focus());
  await pointer(first, 'pointerover');
  await act(async () => vi.advanceTimersByTimeAsync(151));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
