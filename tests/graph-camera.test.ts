import { afterEach, expect, it, vi } from 'vitest';
import { createGraphCameraSettler, findGraphPointerTarget, getGraphFitGeometry, getGraphUsableViewport } from '../src/client/graph-camera';

afterEach(() => vi.useRealTimers());
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
