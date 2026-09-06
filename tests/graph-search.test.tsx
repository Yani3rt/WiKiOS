// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { GraphSearch } from '../src/components/graph-search';
import type { GraphNode } from '../src/lib/wiki-shared';

let root: Root;
let host: HTMLDivElement;
const select = vi.fn();
const nodes = ['Alpha','Beta'].map(title => ({slug:title,title,categories:[],neighbors:[],wordCount:10,backlinkCount:0,summary:''})) as GraphNode[];
function Harness() {
  const searchInputRef=useRef<HTMLInputElement>(null);
  const [search,setSearch]=useState({query:'',indexOpen:false,visibleResultCount:10});
  return <MemoryRouter><GraphSearch nodes={nodes} onSelect={select} onCompactSearchInteraction={()=>{}} detailPanelCollapsed={true} selectedSlug={null} searchInputRef={searchInputRef} search={search} setSearch={setSearch}/><button id="outside">Outside</button></MemoryRouter>;
}
beforeEach(async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{cb(0);return 0;});
  Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
  select.mockClear(); host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<Harness/>));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const input=()=>host.querySelector('input')!;
async function type(value:string) {
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);
    input().dispatchEvent(new Event('input',{bubbles:true}));
  });
}
it('uses the empty search field to browse, filter, and return to all notes',async()=>{
  expect(host.querySelector('[aria-label="Browse nodes"]')).toBeNull();
  await act(async()=>input().focus());
  expect(host.querySelector('h2')?.textContent).toBe('All notes');
  await type('Beta');
  expect(host.querySelectorAll('li')).toHaveLength(1);
  await type('');
  expect(host.querySelectorAll('li')).toHaveLength(2);
});
it('Escape closes without selecting or reopening, and a subsequent tap reopens',async()=>{
  await act(async()=>input().focus());
  await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('#graph-node-index')).toBeNull();
  expect(select).not.toHaveBeenCalled();
  await act(async()=>input().click());
  expect(host.querySelector('#graph-node-index')).not.toBeNull();
});
it('outside taps dismiss, while selecting a result closes and blurs on mobile',async()=>{
  await act(async()=>input().focus());
  await act(async()=>host.querySelector('#outside')!.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  expect(host.querySelector('#graph-node-index')).toBeNull();
  await act(async()=>input().click());
  await act(async()=>host.querySelector<HTMLButtonElement>('li button')!.click());
  expect(select).toHaveBeenCalledWith('Alpha');
  expect(host.querySelector('#graph-node-index')).toBeNull();
  expect(document.activeElement).not.toBe(input());
});
it('supports ArrowDown and Enter without bringing the phone keyboard back',async()=>{
  await act(async()=>input().focus());
  await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  expect(document.activeElement).toBe(host.querySelector('li button'));
  await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  expect(select).toHaveBeenCalledWith('Alpha');
  expect(host.querySelector('#graph-node-index')).toBeNull();
  expect(document.activeElement).not.toBe(input());
});
it('desktop close restores input focus without reopening until the next tap',async()=>{
  Object.defineProperty(window,'innerWidth',{value:1280,configurable:true});
  await act(async()=>input().focus());
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node index"]')!.click());
  expect(document.activeElement).toBe(input());
  expect(host.querySelector('#graph-node-index')).toBeNull();
  await act(async()=>input().click());
  expect(host.querySelector('#graph-node-index')).not.toBeNull();
});
it('the dismiss layer consumes the tap rather than selecting a graph node',async()=>{
  await act(async()=>input().focus());
  const event=new Event('pointerdown',{bubbles:true,cancelable:true});
  await act(async()=>host.querySelector('.graph-search-dismiss')!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(host.querySelector('#graph-node-index')).toBeNull();
  expect(select).not.toHaveBeenCalled();
});
