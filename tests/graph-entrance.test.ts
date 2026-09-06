import { expect, it, vi } from 'vitest';
import { buildEntranceDelays, entranceFrame, createEntranceController } from '../src/client/graph-entrance';
it('reveals hubs before their outer neighbors and includes isolated notes', () => {
  const delays = buildEntranceDelays(['hub','a','b','c','alone'], [
    {source:'hub',target:'a'}, {source:'hub',target:'b'}, {source:'hub',target:'c'},
  ]);
  expect(delays.get('hub')).toBe(0);
  expect(delays.get('a')).toBeGreaterThan(delays.get('hub')!);
  expect(delays.size).toBe(5);
  expect(Math.max(...delays.values())).toBeLessThanOrEqual(600);
});
it('finishes nodes before labels and settles everything at two seconds', () => {
  expect(entranceFrame(0,0)).toEqual({node:0,label:0});
  expect(entranceFrame(1300,600)).toEqual({node:1,label:0});
  expect(entranceFrame(1700,600).label).toBeGreaterThan(0);
  expect(entranceFrame(2000,600)).toEqual({node:1,label:1});
});
it('finishes immediately for reduced motion and cancels scheduled work on interaction', () => {
  const frame = vi.fn(); const cancel = vi.fn(); let callback: FrameRequestCallback = () => {};
  const request = vi.fn((cb: FrameRequestCallback) => { callback=cb; return 1; });
  const controller = createEntranceController({onFrame:frame, requestFrame:request, cancelFrame:cancel, now:()=>0});
  controller.start(true); expect(frame).toHaveBeenLastCalledWith(2000); expect(request).not.toHaveBeenCalled();
  const active = createEntranceController({onFrame:frame, requestFrame:request, cancelFrame:cancel, now:()=>0});
  active.start(false); callback(200); active.finish();
  expect(cancel).toHaveBeenCalled(); expect(frame).toHaveBeenLastCalledWith(2000);
  frame.mockClear(); callback(300); expect(frame).not.toHaveBeenCalled();
});
it('destroy cancels without publishing or restarting', () => {
  const frame=vi.fn(); const cancel=vi.fn();
  const controller=createEntranceController({onFrame:frame,requestFrame:()=>1,cancelFrame:cancel,now:()=>0});
  controller.start(false); controller.destroy(); frame.mockClear(); controller.start(false); controller.finish();
  expect(cancel).toHaveBeenCalledWith(1); expect(frame).not.toHaveBeenCalled();
});
it('stops naturally and cannot restart after an early finish', () => {
  const frames:number[]=[]; let callback:FrameRequestCallback=()=>{};
  const request=vi.fn((cb:FrameRequestCallback)=>{callback=cb;return 1;});
  const c=createEntranceController({onFrame:t=>frames.push(t),requestFrame:request,cancelFrame:vi.fn(),now:()=>100});
  c.start(false); callback(2100);
  expect(frames).toEqual([0,2000]);
  expect(request).toHaveBeenCalledTimes(1);
  c.start(false); expect(request).toHaveBeenCalledTimes(1);
  const early=createEntranceController({onFrame:t=>frames.push(t),requestFrame:request,cancelFrame:vi.fn()});
  early.finish(); early.start(false); expect(request).toHaveBeenCalledTimes(1);
});
