// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { createGraphCameraSettler } from '../src/client/graph-camera';
import { createGraphNeighborhoodLayer } from '../src/client/graph-neighborhood-layer';
import type { GraphNeighborhood } from '../src/client/graph-neighborhoods';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();document.body.innerHTML='';document.head.querySelectorAll('style').forEach(style=>style.remove());});
function applyHubStyles(reducedMotion=false) {
  const source=readFileSync('src/client/globals.css','utf8');
  const sheet=document.createElement('style');
  sheet.textContent=source.slice(source.indexOf('/* Navigation anchors'),source.indexOf('/* Quiet, data-backed peeks'));
  document.head.append(sheet);
  // jsdom does not evaluate media queries; CSSOM still resolves real selectors/cascade.
  const resolve=(rules:CSSRuleList):string[]=>[...rules].flatMap(rule=>rule.type===CSSRule.MEDIA_RULE
    ? reducedMotion && (rule as CSSMediaRule).conditionText==='(prefers-reduced-motion:reduce)' ? resolve((rule as CSSMediaRule).cssRules) : []
    : [rule.cssText]);
  sheet.textContent=resolve(sheet.sheet!.cssRules).join('\n');
}
const group:GraphNeighborhood={id:'a',label:'Research',members:Array.from({length:30},(_,i)=>`n${i}`),hubs:['n0']};
function setup(anchor={x:120,y:-120},memoryAction:'show-all'|'show-neighborhoods'='show-all') {
  const context={globalAlpha:1,setTransform:vi.fn(),clearRect:vi.fn(),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),quadraticCurveTo:vi.fn(),stroke:vi.fn(),setLineDash:vi.fn(),ellipse:vi.fn()};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const container=document.createElement('div');document.body.append(container);
  const listeners=new Set<()=>void>();const onSelect=vi.fn(),onMemory=vi.fn();
  const state={anchorOpacity:undefined as number|undefined,overview:memoryAction==='show-all',hubCentered:true,memoryAction,moving:false,currentNeighborhood:null as string|null,opacity:1,bounds:{left:20,top:60,right:580,bottom:480},obstacles:[] as {left:number;top:number;right:number;bottom:number}[],color:'#abcdef',anchorColor:()=> '#6789ab'};
  const sigma={getDimensions:()=>({width:600,height:500}),graphToViewport:(p:{x:number;y:number})=>({x:p.x+300,y:p.y+280}),on:(_event:string,fn:()=>void)=>listeners.add(fn),off:(_event:string,fn:()=>void)=>listeners.delete(fn)};
  const previews=new Map([['a',{id:'a',title:'Research',noteCount:30,notes:[{slug:'n0',title:'Research index'},{slug:'n1',title:'First discovery'}],connections:[{id:'b',label:'Projects',count:2}]}]]);
  const layer=createGraphNeighborhoodLayer({container,sigma,groups:[group],previews,onSelect,onMemory,getGeometry:()=>({anchors:[{id:'a',...anchor}],points:[]}),getState:()=>({...state,anchorOpacity:state.anchorOpacity ?? Number(state.overview)})});
  layer.refresh();
  return {context,container,listeners,onSelect,onMemory,state,layer};
}
it('represents a thirty-note group with a compact counted button and a separate navigation hub',()=>{
  const {container,onSelect,onMemory}=setup();
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  expect(anchor.textContent).toContain('Research');expect(anchor.textContent).toContain('30');expect(anchor.hidden).toBe(false);
  anchor.click();expect(onSelect).toHaveBeenCalledWith(group);
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  expect(hub.textContent).toContain('My Memory');hub.click();expect(onMemory).toHaveBeenCalledOnce();
});
it('draws dotted organizational spokes without drawing enclosing shapes',()=>{
  const {context}=setup();
  expect(context.setLineDash).toHaveBeenCalledWith([1,7]);
  expect(context.stroke).toHaveBeenCalled();expect(context.ellipse).not.toHaveBeenCalled();
});
it('keeps a focused anchor focused through subsequent renderer redraws',()=>{
  const {container,layer}=setup();
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  anchor.focus();layer.refresh();layer.refresh();expect(document.activeElement).toBe(anchor);
});
it('docks the hub as a return action while notes are expanded or filtered',()=>{
  const {container,state,layer}=setup();state.overview=false;state.hubCentered=false;layer.refresh();
  expect(container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.hidden).toBe(true);
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  expect(hub.hidden).toBe(false);expect(hub.classList.contains('is-docked')).toBe(true);
  expect(hub.getAttribute('aria-label')).toBe('Show all notes');
});
it('does not flash during entrance or cover obstructing search controls',()=>{
  const {container,state,layer}=setup();state.opacity=0;layer.refresh();
  expect([...container.querySelectorAll('button')].every(button=>button.hidden)).toBe(true);
  state.opacity=1;state.obstacles=[{left:300,right:580,top:60,bottom:220}];layer.refresh();
  expect(container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.hidden).toBe(true);
});
it('unsubscribes the render listener and removes all controls on destroy',()=>{
  const {container,listeners,layer}=setup();layer.destroy();layer.refresh();
  expect(listeners.size).toBe(0);expect(container.childElementCount).toBe(0);expect(layer.getTitleBounds()).toEqual([]);
});
it('keeps short neighborhood actions visible near a narrow viewport edge',()=>{
  const {container,state,layer}=setup();state.bounds.right=470;layer.refresh();
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  expect(anchor.hidden).toBe(false);
  expect(Number.parseFloat(anchor.style.width)).toBeGreaterThanOrEqual(72);
});
it('does not hide nearby anchors behind empty horizontal hub padding',()=>{
  const {container}=setup({x:120,y:38});
  expect(container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.hidden).toBe(false);
});
it('keeps a zone dot visible when its caption crosses the viewport edge and restores the caption on return',()=>{
  applyHubStyles();
  const point={x:275,y:-120};
  const {container,layer,onSelect}=setup(point);
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  const caption=anchor.querySelector<HTMLElement>('.graph-anchor-caption')!;
  expect(anchor.hidden).toBe(false);
  expect(getComputedStyle(anchor.querySelector('.graph-anchor-core')!).display).not.toBe('none');
  expect(getComputedStyle(caption).display).toBe('none');
  anchor.click();expect(onSelect).toHaveBeenCalledWith(group);
  point.x=500;layer.invalidate();expect(anchor.hidden).toBe(false);
  point.x=120;layer.invalidate();
  expect(anchor.hidden).toBe(false);expect(getComputedStyle(caption).display).toBe('flex');
});
it('keeps a zone dot when zooming brings its caption into the memory hub',()=>{
  applyHubStyles();
  const point={x:120,y:-120};
  const {container,layer,onSelect}=setup(point);
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  const caption=anchor.querySelector<HTMLElement>('.graph-anchor-caption')!;
  point.x=40;point.y=-20;layer.invalidate();
  expect(anchor.hidden).toBe(false);expect(getComputedStyle(caption).display).toBe('none');
  expect(anchor.style.width).toBe('36px');
  anchor.click();expect(onSelect).toHaveBeenCalledWith(group);
  point.x=120;point.y=-120;layer.invalidate();
  expect(anchor.hidden).toBe(false);expect(getComputedStyle(caption).display).toBe('flex');
});
it('does not interpolate zone hit targets when global reduced-motion styles set a transition duration',()=>{
  const reduced=document.createElement('style');reduced.textContent='* { transition-duration: .15s !important; }';document.head.append(reduced);
  applyHubStyles(true);
  const {container}=setup();
  expect(getComputedStyle(container.querySelector('.graph-neighborhood-anchor')!).transitionProperty).toBe('none');
});

function measurePreviews(container:HTMLElement) {
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const isTip=this.classList.contains('graph-neighborhood-preview');
    const isAnchor=this.classList.contains('graph-neighborhood-anchor');
    const x=isAnchor?400:0,y=isAnchor?100:70,width=isTip?180:isAnchor?80:144,height=isTip?140:isAnchor?60:40;
    return {x,y,left:x,top:y,right:x+width,bottom:y+height,width,height,toJSON(){}};
  });
  return ()=>container.querySelector<HTMLElement>('[role="tooltip"]')!;
}
it('shows real neighborhood titles and recorded cross-neighborhood relationships without expanding on focus',()=>{
  const {container,onSelect,onMemory}=setup();const tip=measurePreviews(container);
  container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.focus();
  expect(tip().hidden).toBe(false);expect(tip().textContent).toContain('Research index');expect(tip().textContent).toContain('Projects');expect(tip().textContent).toContain('2 links');
  expect(onSelect).not.toHaveBeenCalled();expect(onMemory).not.toHaveBeenCalled();
});
it('marks the current neighborhood in the hub directory and dismisses when an anchor hides',()=>{
  const {container,state,layer}=setup();const tip=measurePreviews(container);
  container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.focus();expect(tip().hidden).toBe(false);
  state.overview=false;state.hubCentered=false;state.currentNeighborhood='a';layer.refresh();expect(tip().hidden).toBe(true);
  container.querySelector<HTMLButtonElement>('.graph-memory-hub')!.focus();
  expect(tip().textContent).toContain('My Memory');expect(tip().querySelector('[aria-current="true"]')?.textContent).toContain('Research');
});

it('suppresses the stationary docked hub preview throughout camera movement without blocking navigation',()=>{
  vi.useFakeTimers();
  const {container,state,layer,onMemory}=setup();const tip=measurePreviews(container);
  state.overview=false;state.hubCentered=false;layer.refresh();
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  const onMove=vi.fn(()=>{state.moving=true;layer.dismissPreview();});
  const camera=createGraphCameraSettler(onMove,()=>{state.moving=false;});
  camera.updated();
  const hover=new MouseEvent('pointerenter');Object.defineProperty(hover,'pointerType',{value:'mouse'});hub.dispatchEvent(hover);
  for(let i=0;i<4;i++) {vi.advanceTimersByTime(70);camera.updated();layer.refresh();}
  expect(onMove).toHaveBeenCalledOnce();expect(state.moving).toBe(true);expect(tip().hidden).toBe(true);
  hub.focus();expect(tip().hidden).toBe(true);expect(hub.hasAttribute('aria-describedby')).toBe(false);
  hub.click();expect(onMemory).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(90);expect(state.moving).toBe(false);
  hub.blur();hub.focus();expect(tip().hidden).toBe(false);
  camera.destroy();layer.destroy();
});

it('exposes the current hub action and preserves one-click navigation without toggling on focus',()=>{
  const {container,state,layer,onMemory}=setup();measurePreviews(container);
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  expect(hub.getAttribute('aria-label')).toBe('Show all notes');
  hub.focus();expect(onMemory).not.toHaveBeenCalled();
  hub.click();expect(onMemory).toHaveBeenCalledTimes(1);
  state.overview=false;state.memoryAction='show-neighborhoods';layer.refresh();
  expect(hub.hidden).toBe(false);expect(hub.getAttribute('aria-label')).toBe('Show neighborhoods');
  hub.click();expect(onMemory).toHaveBeenCalledTimes(2);
  layer.destroy();
});

it('keeps one central hub in all-notes mode without organizational spokes or neighborhood controls',()=>{
  const {container,state,layer,context,onMemory}=setup();
  state.overview=false;state.memoryAction='show-neighborhoods';context.stroke.mockClear();layer.refresh();
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  expect(hub.hidden).toBe(false);expect(hub.classList.contains('is-docked')).toBe(false);
  expect(hub.style.transform).toBe('translate(236px, 262px)');
  expect(layer.getTitleBounds()).toEqual([{left:236,right:364,top:262,bottom:334}]);
  expect([...container.querySelectorAll<HTMLButtonElement>('.graph-neighborhood-anchor')].every(button=>button.hidden)).toBe(true);
  expect(context.stroke).not.toHaveBeenCalled();hub.click();expect(onMemory).toHaveBeenCalledOnce();
});
it('docks an obscured or offscreen center without duplicating the hub and restores it when clear',()=>{
  const {container,state,layer,onMemory}=setup();state.overview=false;state.memoryAction='show-neighborhoods';
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  state.obstacles=[{left:200,right:400,top:240,bottom:350}];layer.refresh();
  expect(hub.hidden).toBe(false);expect(hub.classList.contains('is-docked')).toBe(true);
  expect(hub.style.transform).toBe('translate(28px, 62px)');
  state.obstacles=[];state.bounds.right=200;layer.refresh();expect(hub.classList.contains('is-docked')).toBe(true);
  expect(container.querySelectorAll('.graph-memory-hub')).toHaveLength(1);hub.click();expect(onMemory).toHaveBeenCalledOnce();
  state.bounds.right=580;layer.refresh();expect(hub.classList.contains('is-docked')).toBe(false);
  state.bounds.right=100;layer.refresh();expect(hub.hidden).toBe(true);
});

it.each(['show-all','show-neighborhoods'] as const)('renders the initial %s glyph without playing a mode transition',memoryAction=>{
  applyHubStyles();
  const {container,layer,onMemory}=setup(undefined,memoryAction);measurePreviews(container);
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  expect(hub.classList.contains('is-expanded')).toBe(memoryAction==='show-neighborhoods');
  expect(hub.classList.contains('has-mode-transition')).toBe(false);
  const glyph=getComputedStyle(hub.querySelector('.graph-memory-mark')!);
  expect(glyph.transform).toBe(memoryAction==='show-neighborhoods'?'rotate(180deg)':'rotate(0deg)');
  expect(glyph.transition).toBe('');
  hub.focus();layer.refresh();layer.refresh();
  expect(hub.classList.contains('has-mode-transition')).toBe(false);expect(onMemory).not.toHaveBeenCalled();
  layer.destroy();
});
it('retargets the same glyph when reversing mode and does not animate the button position',()=>{
  const {container,state,layer}=setup();const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  const position=hub.style.transform;
  state.overview=false;state.memoryAction='show-neighborhoods';layer.refresh();
  expect(hub.classList.contains('is-expanded')).toBe(true);expect(hub.classList.contains('has-mode-transition')).toBe(true);
  expect(hub.style.transform).toBe(position);
  layer.refresh();expect(hub.classList.contains('is-expanded')).toBe(true);
  state.overview=true;state.memoryAction='show-all';layer.refresh();
  expect(hub.classList.contains('is-expanded')).toBe(false);expect(hub.classList.contains('has-mode-transition')).toBe(true);
  expect(container.querySelector('.graph-memory-hub')).toBe(hub);expect(hub.style.transform).toBe(position);
});

it('unfolds clockwise and retracts counterclockwise without rotating or resizing the button and label',()=>{
  applyHubStyles();
  const {container,state,layer}=setup();
  const hub=container.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  const mark=hub.querySelector('.graph-memory-mark')!,spoke=mark.querySelector('i')!,label=hub.lastElementChild!;
  const position=hub.style.transform,buttonWidth=hub.style.width;
  expect(getComputedStyle(mark).transform).toBe('rotate(0deg)');
  expect(Number(getComputedStyle(mark).getPropertyValue('--memory-spread'))).toBe(.72);
  state.overview=false;state.memoryAction='show-neighborhoods';layer.refresh();
  expect(getComputedStyle(mark).transform).toBe('rotate(180deg)');
  expect(Number(getComputedStyle(mark).getPropertyValue('--memory-spread'))).toBe(1);
  expect(getComputedStyle(mark).transition).toContain('450ms');
  expect(getComputedStyle(spoke).transition).toContain('450ms');
  state.overview=true;state.memoryAction='show-all';layer.refresh();
  expect(getComputedStyle(mark).transform).toBe('rotate(0deg)');
  expect(Number(getComputedStyle(mark).getPropertyValue('--memory-spread'))).toBe(.72);
  expect(getComputedStyle(mark).transition).toContain('350ms');
  expect(getComputedStyle(spoke).transition).toContain('350ms');
  expect(getComputedStyle(mark).width).toBe('34px');expect(getComputedStyle(mark).height).toBe('34px');
  expect(getComputedStyle(label).transform).toBe('');
  expect(hub.style.width).toBe(buttonWidth);expect(hub.style.transform).toBe(position);
});

it.each(['show-neighborhoods','show-all'] as const)('settles the %s rotation and radial motion immediately with reduced motion',memoryAction=>{
  applyHubStyles(true);
  const {container,state,layer}=setup(undefined,memoryAction==='show-all'?'show-neighborhoods':'show-all');
  state.memoryAction=memoryAction;state.overview=memoryAction==='show-all';layer.refresh();
  const mark=container.querySelector('.graph-memory-mark')!;
  expect(getComputedStyle(mark).transform).toBe(memoryAction==='show-neighborhoods'?'rotate(180deg)':'rotate(0deg)');
  expect(getComputedStyle(mark).transition).toBe('none');
  for(const spoke of mark.querySelectorAll('i')) expect(getComputedStyle(spoke).transition).toBe('none');
});

it('fades retiring anchors and organizational spokes without leaving interactive ghosts',()=>{
  const {container,state,layer,context}=setup();
  state.overview=false;state.anchorOpacity=.4;layer.refresh();
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  expect(anchor.hidden).toBe(false);expect(Number(anchor.style.opacity)).toBeCloseTo(.4);
  expect(anchor.inert).toBe(true);expect(anchor.getAttribute('aria-hidden')).toBe('true');
  expect(context.globalAlpha).toBeCloseTo(.096);
  state.anchorOpacity=0;layer.refresh();expect(anchor.hidden).toBe(true);
  state.overview=true;state.anchorOpacity=.3;layer.refresh();
  expect(anchor.hidden).toBe(false);expect(anchor.inert).toBe(false);expect(anchor.hasAttribute('aria-hidden')).toBe(false);
});
it.each([false,true])('softens newly placed anchor cores and captions without moving their hit targets (reduced motion: %s)',reduced=>{
  applyHubStyles(reduced);const {container}=setup();
  const anchor=container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  const core=anchor.querySelector('.graph-anchor-core')!,caption=anchor.querySelector('.graph-anchor-caption')!;
  expect(getComputedStyle(anchor).animation).toBe('');
  for(const child of [core,caption]) {
    const animation=getComputedStyle(child).animation;
    if(reduced) expect(animation).toBe('none');
    else {expect(animation).toContain('280ms');expect(animation).toContain('cubic-bezier');}
  }
});

it('keeps the docked hub preview available while retiring anchors lose their previews',()=>{
  const {container,state,layer}=setup();const tip=measurePreviews(container);
  container.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.focus();expect(tip().hidden).toBe(false);
  state.overview=false;state.anchorOpacity=.4;state.hubCentered=false;layer.refresh();expect(tip().hidden).toBe(true);
  container.querySelector<HTMLButtonElement>('.graph-memory-hub')!.focus();expect(tip().hidden).toBe(false);
  layer.refresh();expect(tip().hidden).toBe(false);
});

it('distinguishes fade-hidden controls from obstructed anchor geometry when deciding whether to fit',()=>{
  const {state,layer}=setup();state.anchorOpacity=0;layer.refresh();
  expect(layer.hasObstructedAnchors()).toBe(false);
  state.bounds.right=350;layer.refresh();expect(layer.hasObstructedAnchors()).toBe(true);
});
