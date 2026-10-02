import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import Sigma's real Camera without constructing a WebGL renderer in Node.
vi.hoisted(() => {
  const constants = {BOOL:0x8b56,BYTE:0x1400,UNSIGNED_BYTE:0x1401,SHORT:0x1402,UNSIGNED_SHORT:0x1403,INT:0x1404,UNSIGNED_INT:0x1405,FLOAT:0x1406};
  vi.stubGlobal("WebGL2RenderingContext", constants);
  vi.stubGlobal("WebGLRenderingContext", constants);
});
import { Camera } from "sigma";
import { GraphMotionCamera } from "../src/client/graph-motion-camera";

let now: number;
let nextHandle: number;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  now = 0; nextHandle = 0; frames = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextHandle, callback); return nextHandle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());
function tick(time: number) {
  now = time;
  const pending = [...frames.values()]; frames.clear();
  for (const callback of pending) callback(time);
}

const target = {x:0.25,y:0.75,ratio:0.55,angle:0.1};

describe("motion-aware Sigma camera", () => {
  it("sets a zero-duration target synchronously without NaN, RAF, or an unresolved promise", async () => {
    const camera = new GraphMotionCamera();
    expect(camera).toBeInstanceOf(Camera);
    const updates: unknown[] = [];
    camera.on("updated", state => updates.push(state));
    const completion = camera.animate(target, {duration:0});
    expect(camera.getState()).toEqual(target);
    expect(updates).toEqual([target]);
    expect(camera.isAnimated()).toBe(false);
    expect(frames.size).toBe(0);
    await expect(completion).resolves.toBeUndefined();
  });

  it("settles the active target and rejects stale frames when reduced motion is enabled", async () => {
    const camera = new GraphMotionCamera();
    const completion = camera.animate(target, {duration:1000,easing:"linear"});
    tick(250);
    expect(camera.getState()).toMatchObject({x:0.4375,y:0.5625,ratio:0.8875});
    const stale = [...frames.values()][0];
    camera.setReducedMotion(true);
    expect(camera.getState()).toEqual(target);
    expect(frames.size).toBe(0);
    expect(camera.isAnimated()).toBe(false);
    stale(500);
    expect(camera.getState()).toEqual(target);
    expect(frames.size).toBe(0);
    await expect(completion).resolves.toBeUndefined();
    camera.setReducedMotion(false);
    expect(frames.size).toBe(0);
  });

  it("resolves a replaced promise and cancels its frame without disturbing its replacement", async () => {
    const camera = new GraphMotionCamera();
    const first = camera.animate({x:0}, {duration:1000,easing:"linear"});
    tick(200);
    const stale = [...frames.values()][0];
    const second = camera.animate({x:1}, {duration:1000,easing:"linear"});
    await expect(first).resolves.toBeUndefined();
    expect(frames.size).toBe(1);
    stale(500);
    expect(camera.getState().x).toBeCloseTo(0.4);
    expect(frames.size).toBe(1);
    tick(700);
    expect(camera.getState().x).toBeCloseTo(0.7);
    tick(1200);
    expect(camera.getState().x).toBe(1);
    expect(frames.size).toBe(0);
    await expect(second).resolves.toBeUndefined();
  });

  it("supports callback replacement and named or custom easing", () => {
    const camera = new GraphMotionCamera({x:0});
    const first = vi.fn(), second = vi.fn();
    expect(camera.animate({x:1}, {duration:1000,easing:"quadraticIn"}, first)).toBeUndefined();
    tick(500);
    expect(camera.getState().x).toBeCloseTo(0.25);
    camera.animate({x:0.75}, {duration:1000,easing:progress=>progress}, second);
    expect(first).toHaveBeenCalledTimes(1);
    tick(1000);
    expect(camera.getState().x).toBeCloseTo(0.5);
    tick(1500);
    expect(second).toHaveBeenCalledTimes(1);
    expect(camera.getState().x).toBe(0.75);
  });

  it("uses the same reduced-motion path for inherited zoom and reset methods", async () => {
    const camera = new GraphMotionCamera({x:0.25,y:0.75,ratio:1,angle:0.1});
    camera.setReducedMotion(true);
    await camera.animatedZoom({factor:2,duration:200});
    expect(camera.getState().ratio).toBe(0.5);
    await camera.animatedUnzoom({factor:2,duration:200});
    expect(camera.getState().ratio).toBe(1);
    await camera.animatedReset({duration:200});
    expect(camera.getState()).toEqual({x:0.5,y:0.5,ratio:1,angle:0});
    expect(frames.size).toBe(0);
  });

  it("applies Sigma's public camera constraints before animating", async () => {
    const camera = new GraphMotionCamera();
    camera.enabledRotation = false;
    camera.minRatio = 0.5;
    await camera.animate({ratio:0.1,angle:1}, {duration:0});
    expect(camera.getState()).toEqual({x:0.5,y:0.5,ratio:0.5,angle:0});
  });

  it("cancels at the current state and destroys without leaving promises or callbacks pending", async () => {
    const camera = new GraphMotionCamera();
    const completion = camera.animate({x:1}, {duration:1000,easing:"linear"});
    tick(200);
    camera.cancel();
    expect(camera.getState().x).toBe(0.6);
    expect(camera.isAnimated()).toBe(false);
    expect(frames.size).toBe(0);
    await expect(completion).resolves.toBeUndefined();
    const callback = vi.fn();
    camera.animate({x:0}, {duration:1000}, callback);
    const stale = [...frames.values()][0];
    camera.destroy();
    stale(500);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(camera.getState().x).toBe(0.6);
    expect(frames.size).toBe(0);
    await camera.animate(target, {duration:1000});
    expect(camera.getState().x).toBe(0.6);
    expect(frames.size).toBe(0);
  });

  it("respects public disable and resumes only for new requests after enable", async () => {
    const camera = new GraphMotionCamera();
    const completion = camera.animate({x:1},{duration:1000});
    camera.disable();
    await expect(completion).resolves.toBeUndefined();
    await camera.animate({x:0},{duration:0});
    expect(camera.getState().x).toBe(0.5);
    expect(frames.size).toBe(0);
    camera.enable();
    await camera.animate({x:1},{duration:0});
    expect(camera.getState().x).toBe(1);
  });
});
