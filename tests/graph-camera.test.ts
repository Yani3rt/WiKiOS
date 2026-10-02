import { afterEach, expect, it, vi } from 'vitest';
import { createGraphCameraSettler, findGraphPointerTarget, getGraphFitGeometry, getGraphRevealGeometry, getGraphUsableViewport } from '../src/client/graph-camera';

afterEach(() => vi.useRealTimers());
it('keeps the exploration camera anchored when all related notes are already visible',()=>{
  expect(getGraphRevealGeometry([{x:300,y:200},{x:600,y:400}],{left:20,top:80,right:900,bottom:600})).toBeNull();
});
it('pans only as far as needed to uncover a note without changing zoom',()=>{
  const reveal=getGraphRevealGeometry([{x:600,y:200},{x:900,y:300}],{left:20,top:80,right:800,bottom:600})!;
  expect(reveal.scale).toBe(1);
  expect(reveal.target).toEqual({x:476,y:200});
});
it('zooms out around the selected note only when the related-note span cannot fit',()=>{
  const points=[{x:400,y:300},{x:-100,y:100},{x:1100,y:700}];
  const bounds={left:20,top:80,right:900,bottom:600};
  const reveal=getGraphRevealGeometry(points,bounds)!;
  expect(reveal.scale).toBeGreaterThan(1);
  expect(reveal.anchor).toEqual(points[0]);
  for(const point of points) {
    const projected={x:reveal.target.x+(point.x-reveal.anchor.x)/reveal.scale,y:reveal.target.y+(point.y-reveal.anchor.y)/reveal.scale};
    expect(projected.x).toBeGreaterThanOrEqual(bounds.left);
    expect(projected.x).toBeLessThanOrEqual(bounds.right);
    expect(projected.y).toBeGreaterThanOrEqual(bounds.top);
    expect(projected.y).toBeLessThanOrEqual(bounds.bottom);
  }
  expect(getGraphRevealGeometry([],bounds)).toBeNull();
  expect(getGraphRevealGeometry([{x:NaN,y:0}],bounds)).toBeNull();
});
it('reserves desktop details, header and legend instead of centering underneath them', () => {
  expect(getGraphUsableViewport({ width:1280, height:720, headerBottom:64, searchBottom:54,
    details:{left:944,top:76,right:1264,bottom:600}, legend:{left:20,top:580,right:640,bottom:698},
  })).toEqual({left:20,top:84,right:924,bottom:560});
});
it('treats tablet details as a bottom sheet and reserves the vertical toolbar', () => {
  const bounds = getGraphUsableViewport({width:660,height:800,searchBottom:120,
    details:{left:12,top:440,right:648,bottom:788}, toolbar:{left:604,top:284,right:648,bottom:416},
  });
  expect(bounds).toEqual({left:20,top:140,right:590,bottom:420});
});
it('fits every node inside the usable space, not just the selected node', () => {
  const points = [{x:100,y:100},{x:1000,y:600},{x:500,y:350}];
  const bounds = {left:20,top:84,right:924,bottom:560};
  const fit = getGraphFitGeometry(points,bounds)!;
  for(const point of points) {
    const x = fit.target.x + (point.x-fit.center.x)/fit.ratio;
    const y = fit.target.y + (point.y-fit.center.y)/fit.ratio;
    expect(x).toBeGreaterThan(bounds.left); expect(x).toBeLessThan(bounds.right);
    expect(y).toBeGreaterThan(bounds.top); expect(y).toBeLessThan(bounds.bottom);
  }
});
it('bounds zoom for a single filtered or isolated note and rejects empty/nonfinite data', () => {
  const bounds = {left:20,top:80,right:900,bottom:600};
  expect(getGraphFitGeometry([{x:800,y:900}],bounds)).toMatchObject({center:{x:800,y:900},ratio:0.55});
  expect(getGraphFitGeometry([],bounds)).toBeNull();
  expect(getGraphFitGeometry([{x:NaN,y:0}],bounds)).toBeNull();
});
it('keeps bounds finite in short and tiny viewports',()=>{
  const bounds=getGraphUsableViewport({width:320,height:240,searchBottom:120,details:{left:12,top:100,right:308,bottom:228}});
  expect(bounds.right).toBeGreaterThan(bounds.left); expect(bounds.bottom).toBeGreaterThan(bounds.top);
  expect(bounds.bottom).toBeLessThanOrEqual(240);
});
it('clicks labels and forgiving node hit areas, preferring a nearer dot over overlapping labels',()=>{
  const nodes=[{slug:'a',x:30,y:30,radius:5,label:{left:40,top:20,right:120,bottom:40}}, {slug:'b',x:100,y:30,radius:5}];
  expect(findGraphPointerTarget({x:45,y:45},nodes)).toBeNull();
  expect(findGraphPointerTarget({x:30,y:47},nodes)).toBe('a');
  expect(findGraphPointerTarget({x:65,y:30},nodes)).toBe('a');
  expect(findGraphPointerTarget({x:100,y:30},nodes)).toBe('b');
  expect(findGraphPointerTarget({x:300,y:300},nodes)).toBeNull();
});
it('recomputes labels once after every camera-input burst and cancels on teardown',()=>{
  vi.useFakeTimers(); const moving=vi.fn(), settled=vi.fn();
  const observer=createGraphCameraSettler(moving,settled);
  observer.updated(); vi.advanceTimersByTime(60); observer.updated(); vi.advanceTimersByTime(60);
  expect(settled).not.toHaveBeenCalled(); vi.advanceTimersByTime(40);
  expect(settled).toHaveBeenCalledTimes(1); expect(moving).toHaveBeenCalledTimes(1);
  observer.updated(); observer.destroy(); vi.runAllTimers(); expect(settled).toHaveBeenCalledTimes(1);
});

it('keeps selected-neighborhood labels readable on a narrow canvas with vertical placements',async()=>{
  const {getCollisionAwareGraphLabelPlacements}=await import('../src/client/graph-overview-model');
  const placements=getCollisionAwareGraphLabelPlacements([
    {slug:'selected',x:200,y:160,nodeSize:18,labelWidth:65,labelHeight:20,priority:10},
    {slug:'neighbor',x:62,y:160,nodeSize:18,labelWidth:120,labelHeight:20,priority:1},
  ],{width:300,height:400,padding:20,gap:5});
  expect(placements.size).toBe(2);
  expect(['above-right','below-right']).toContain(placements.get('neighbor'));
});
it('leaves room above the highest note for a quiet neighborhood heading',()=>{
  const bounds={left:20,top:84,right:1260,bottom:550};
  const fit=getGraphFitGeometry([{x:400,y:0},{x:800,y:600}],bounds)!;
  const top=fit.target.y+(0-fit.center.y)/fit.ratio;
  expect(top-46).toBeGreaterThanOrEqual(bounds.top);
});
it('uses the available detail space for a small neighborhood inside a much larger map',()=>{
  const fit=getGraphFitGeometry([{x:0,y:0},{x:70,y:60}],{left:20,top:84,right:1260,bottom:496})!;
  expect(60/fit.ratio).toBeGreaterThan(247);
  expect(fit.ratio).toBeGreaterThanOrEqual(.18);
});
