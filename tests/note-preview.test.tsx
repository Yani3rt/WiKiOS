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
