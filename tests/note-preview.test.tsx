// @vitest-environment jsdom
import {act,useRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NotePreview,previewExcerpt} from "../src/components/note-preview";
let root:Root,container:HTMLDivElement,touch:boolean;
const open=vi.fn(),navigate=vi.fn(),fetchMock=vi.fn();
function Harness(){const ref=useRef<HTMLDivElement>(null);return <div ref={ref}><button data-note-slug="Notes/Beta" onClick={navigate}>Beta</button><a href="/wiki/Notes/Other%2520note">Other</a><NotePreview rootRef={ref} onOpen={open} activeSlug="Alpha"/></div>;}
beforeEach(async()=>{
  vi.useFakeTimers();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);touch=false;open.mockReset();navigate.mockReset();
  vi.stubGlobal("matchMedia",()=>({matches:touch}));
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({slug:"Notes/Beta",title:"Beta",contentMarkdown:"# Beta\n\nA useful **idea** with [a link](/wiki/Alpha).",modifiedAt:1000}),{headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetchMock);container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>root.render(<Harness/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function focus(){await act(async()=>container.querySelector<HTMLButtonElement>('[data-note-slug]')!.focus());await act(async()=>vi.advanceTimersByTimeAsync(351));}
it('waits before requesting a preview and renders plain text without navigating',async()=>{
  await act(async()=>container.querySelector<HTMLButtonElement>('[data-note-slug]')!.focus());
  expect(fetchMock).not.toHaveBeenCalled();await act(async()=>vi.advanceTimersByTimeAsync(351));
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
  await act(async()=>vi.advanceTimersByTimeAsync(400));expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(container.querySelector('[data-note-slug]'));expect(document.activeElement?.hasAttribute('aria-describedby')).toBe(false);
});
it('skips headings and code in the opening excerpt',()=>{
  expect(previewExcerpt('# Title\n\n```js\ncode\n```\n\nOpening paragraph.\n\nSecond paragraph.')).toBe('Opening paragraph.');
});
