// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGraphNeighborhoodPreview, type GraphPreviewContent } from '../src/client/graph-neighborhood-preview';

let destroy:()=>void;
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{destroy?.();vi.restoreAllMocks();vi.useRealTimers();document.body.innerHTML='';document.head.querySelectorAll('style').forEach(style=>style.remove());});
function pointer(element:Element,type:string,pointerType='mouse') {
  const event=new MouseEvent(type,{bubbles:true});Object.defineProperty(event,'pointerType',{value:pointerType});element.dispatchEvent(event);
}
function setup(width=1024) {
  const container=document.createElement('main');document.body.append(container);
  const a=document.createElement('button'),b=document.createElement('button');a.textContent='Alpha';b.textContent='Beta';container.append(a,b);
  let position={left:200,top:180,right:280,bottom:240};
  vi.spyOn(a,'getBoundingClientRect').mockImplementation(()=>({...position,x:position.left,y:position.top,width:80,height:60,toJSON(){}}));
  vi.spyOn(b,'getBoundingClientRect').mockReturnValue({x:200,y:300,left:200,top:300,right:280,bottom:360,width:80,height:60,toJSON(){}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,right:220,bottom:180,width:220,height:180,toJSON(){}});
  const obstacles:{left:number;top:number;right:number;bottom:number}[]=[];
  const bounds={left:20,top:80,right:800,bottom:600};
  let available=true;
  const preview=createGraphNeighborhoodPreview({container,canShow:()=>available,isCompact:()=>width<1024,getBounds:()=>bounds,getObstacles:()=>obstacles});destroy=preview.destroy;
  const content:GraphPreviewContent={title:'Alpha',meta:'30 notes',sections:[{label:'Most connected',items:[{label:'<img src=x onerror=alert(1)>'},{label:'Long note title'}]},{label:'Linked neighborhoods',items:[{label:'Beta',meta:'2 links'}]}]};
  preview.attach(a,()=>content);preview.attach(b,()=>({title:'My Memory',sections:[{items:[{label:'Beta',meta:'3 notes',current:true}],remaining:2}]}));
  const tip=()=>container.querySelector<HTMLElement>('[role="tooltip"]')!;
  return {container,a,b,preview,tip,obstacles,bounds,setAvailable:(value:boolean)=>{available=value;},move:()=>{position={...position,left:210,right:290};}};
}
it('waits for hover intent, renders real text safely and leaves navigation untouched',()=>{
  const {a,tip}=setup();const clicked=vi.fn();a.addEventListener('click',clicked);
  pointer(a,'pointerenter');vi.advanceTimersByTime(249);expect(tip().hidden).toBe(true);
  vi.advanceTimersByTime(1);expect(tip().hidden).toBe(false);expect(tip().textContent).toContain('30 notes');expect(tip().textContent).toContain('<img src=x onerror=alert(1)>');expect(tip().querySelector('img')).toBeNull();expect(clicked).not.toHaveBeenCalled();
  expect(a.getAttribute('aria-describedby')).toBe(tip().id);
});
it('keeps the preview open while crossing the gap and reading its content',()=>{
  const {a,tip}=setup();pointer(a,'pointerenter');vi.advanceTimersByTime(250);
  pointer(a,'pointerleave');vi.advanceTimersByTime(100);pointer(tip(),'pointerenter');vi.advanceTimersByTime(1000);expect(tip().hidden).toBe(false);
  pointer(tip(),'pointerleave');vi.advanceTimersByTime(119);expect(tip().hidden).toBe(false);vi.advanceTimersByTime(1);expect(tip().hidden).toBe(true);
});
it('cancels accidental brief hovers and replaces pending previews on trigger switching',()=>{
  const {a,b,tip}=setup();pointer(a,'pointerenter');vi.advanceTimersByTime(100);pointer(a,'pointerleave');vi.advanceTimersByTime(200);expect(tip().hidden).toBe(true);
  pointer(a,'pointerenter');vi.advanceTimersByTime(150);pointer(b,'pointerenter');vi.advanceTimersByTime(100);expect(tip().hidden).toBe(true);vi.advanceTimersByTime(150);
  expect(tip().textContent).toContain('My Memory');expect(tip().querySelector('[aria-current="true"]')?.textContent).toContain('Beta');expect(tip().textContent).toContain('+2 more');expect(a.hasAttribute('aria-describedby')).toBe(false);
});
it('exposes the preview on keyboard focus and Escape dismisses it without escaping the graph',()=>{
  const {container,a,tip,preview}=setup();a.setAttribute('aria-describedby','existing');a.focus();expect(tip().hidden).toBe(false);expect(a.getAttribute('aria-describedby')).toBe(`existing ${tip().id}`);
  const graphEscape=vi.fn();container.addEventListener('keydown',graphEscape);
  const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});a.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);expect(graphEscape).not.toHaveBeenCalled();expect(tip().hidden).toBe(true);expect(document.activeElement).toBe(a);expect(a.getAttribute('aria-describedby')).toBe('existing');
  preview.refresh();vi.advanceTimersByTime(1000);expect(tip().hidden).toBe(true);
  a.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(graphEscape).toHaveBeenCalledOnce();
});
it('dismisses before ordinary clicks and does not replace the existing click action',()=>{
  const {a,tip}=setup();pointer(a,'pointerenter');vi.advanceTimersByTime(250);
  let navigated=false;a.addEventListener('click',()=>{navigated=true;expect(tip().hidden).toBe(true);});a.click();expect(navigated).toBe(true);
});
it('does not open on touch hover/focus and allows the first tap to navigate',()=>{
  const {a,tip}=setup();let clicked=0;a.addEventListener('click',()=>clicked++);
  pointer(a,'pointerenter','touch');pointer(a,'pointerdown','touch');a.focus();pointer(a,'pointerup','touch');a.click();vi.advanceTimersByTime(1000);
  expect(tip().hidden).toBe(true);expect(clicked).toBe(1);
});
it('dismisses when its anchor moves or hides instead of leaving a stale overlay',()=>{
  const {a,tip,preview,move}=setup();a.focus();expect(tip().hidden).toBe(false);move();preview.refresh();expect(tip().hidden).toBe(true);
  a.blur();a.focus();expect(tip().hidden).toBe(false);a.hidden=true;preview.refresh();expect(tip().hidden).toBe(true);
});
it('clears timers, descriptions and listeners when the layer is destroyed',()=>{
  const {a,container,preview}=setup();pointer(a,'pointerenter');preview.destroy();vi.advanceTimersByTime(1000);
  expect(container.querySelector('[role="tooltip"]')).toBeNull();expect(a.hasAttribute('aria-describedby')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  a.focus();expect(container.querySelector('[role="tooltip"]')).toBeNull();
});
it('dismisses an active preview on an outside pointer action',()=>{
  const {container,a,tip}=setup();a.focus();pointer(container,'pointerdown');expect(tip().hidden).toBe(true);
});

it('keeps the preview reachable across an obstacle-expanded gap while the pointer approaches it',()=>{
  const {container,a,tip,obstacles}=setup();obstacles.push({left:290,right:360,top:80,bottom:600});
  pointer(a,'pointerenter');vi.advanceTimersByTime(250);expect(tip().hidden).toBe(false);expect(tip().style.left).toBe('370px');
  pointer(a,'pointerleave');vi.advanceTimersByTime(100);
  container.dispatchEvent(new MouseEvent('pointermove',{clientX:310,clientY:210,bubbles:true}));
  vi.advanceTimersByTime(100);expect(tip().hidden).toBe(false);
  container.dispatchEvent(new MouseEvent('pointermove',{clientX:350,clientY:210,bubbles:true}));
  vi.advanceTimersByTime(100);pointer(tip(),'pointerenter');vi.advanceTimersByTime(1000);expect(tip().hidden).toBe(false);
});

it('dismisses a stationary preview when resized bounds or new chrome would cover it',()=>{
  const {a,tip,preview,bounds,obstacles}=setup();a.focus();expect(tip().hidden).toBe(false);
  bounds.right=400;preview.refresh();expect(tip().hidden).toBe(true);
  bounds.right=800;a.blur();a.focus();expect(tip().hidden).toBe(false);
  obstacles.push({left:300,right:600,top:100,bottom:400});preview.refresh();expect(tip().hidden).toBe(true);
});

it('blocks new and pending previews while navigation is unavailable and dismisses an open preview on refresh',()=>{
  const {a,tip,preview,setAvailable}=setup();
  pointer(a,'pointerenter');vi.advanceTimersByTime(100);setAvailable(false);
  vi.advanceTimersByTime(150);expect(tip().hidden).toBe(true);expect(a.hasAttribute('aria-describedby')).toBe(false);
  a.focus();expect(tip().hidden).toBe(true);
  pointer(a,'pointerenter');vi.advanceTimersByTime(250);expect(tip().hidden).toBe(true);
  setAvailable(true);a.blur();a.focus();expect(tip().hidden).toBe(false);
  setAvailable(false);preview.refresh();expect(tip().hidden).toBe(true);
});

it.each([390,768,1023])('uses the same lower-center slot for neighborhood and memory previews at %ipx',width=>{
  const {a,b,tip,bounds}=setup(width);
  bounds.right=width-20;
  pointer(a,'pointerenter');vi.advanceTimersByTime(250);
  expect(tip().hidden).toBe(false);
  expect(Number.parseFloat(tip().style.left)).toBeCloseTo(width/2-110);
  expect(tip().style.top).toBe('420px');
  const first={left:tip().style.left,top:tip().style.top};
  pointer(a,'pointerleave');pointer(b,'pointerenter');vi.advanceTimersByTime(250);
  expect(tip().textContent).toContain('My Memory');expect(tip().hidden).toBe(false);
  expect({left:tip().style.left,top:tip().style.top}).toEqual(first);
});
it('bottom-aligns different-height compact cards to the same slot and preserves keyboard descriptions',()=>{
  const {a,b,tip,bounds}=setup(768);bounds.right=748;
  vi.spyOn(tip(),'getBoundingClientRect').mockImplementation(()=>{
    const height=tip().textContent?.includes('Alpha')?200:140;
    return {x:0,y:0,left:0,top:0,right:220,bottom:height,width:220,height,toJSON(){}};
  });
  a.focus();expect(tip().hidden).toBe(false);expect(tip().style.top).toBe('400px');
  expect(a.getAttribute('aria-describedby')).toBe(tip().id);
  a.blur();b.focus();expect(tip().hidden).toBe(false);expect(tip().style.top).toBe('460px');
  expect(b.getAttribute('aria-describedby')).toBe(tip().id);expect(a.hasAttribute('aria-describedby')).toBe(false);
});
it('retains adjacent preview placement at the desktop breakpoint',()=>{
  const {a,tip}=setup(1024);a.focus();
  expect(tip().hidden).toBe(false);expect(tip().style.left).toBe('290px');expect(tip().style.top).toBe('180px');
});

it('does not slide the shared preview slot when global reduced-motion styles set a transition duration',()=>{
  const source=readFileSync('src/client/globals.css','utf8');
  const style=document.createElement('style');
  style.textContent='* { transition-duration:.15s !important; }'+source.match(/\.graph-neighborhood-preview \{[\s\S]*?\}/)![0];
  document.head.append(style);
  const {a,tip}=setup(768);a.focus();
  expect(getComputedStyle(tip()).transitionProperty).toBe('none');
});
