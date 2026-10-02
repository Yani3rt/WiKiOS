export interface GraphMemoryNodeFrame { visibility:number; label:number; scale:number; brightness?:number; }
export const GRAPH_MEMORY_OPEN_MS=600;
export const GRAPH_MEMORY_CLOSE_MS=350;
export const GRAPH_MEMORY_DELAY_MS=90;
const reveal=(from:number,to:number,elapsed:number,start:number,duration:number)=>from+(to-from)*graphRevealEase((elapsed-start)/duration);

/** Absolute appearance values let each interruption begin exactly where it stopped. */
export function getGraphMemoryNodeFrame(from:GraphMemoryNodeFrame,to:number,elapsed:number,delay:number,opening:boolean):GraphMemoryNodeFrame {
  const stagger=Math.max(0,Math.min(GRAPH_MEMORY_DELAY_MS,delay));
  const start=opening ? 30+stagger : 80+(GRAPH_MEMORY_DELAY_MS-stagger)*.4;
  const duration=opening ? 280 : 234;
  return {
    visibility:reveal(from.visibility,to,elapsed,start,duration),
    ...(from.brightness===undefined ? {} : {brightness:reveal(from.brightness,1,elapsed,start,duration)}),
    label:reveal(from.label,to,elapsed,opening ? 320+stagger : 0,opening ? 190 : 100),
    scale:reveal(from.scale,to ? 1 : .12,elapsed,start,duration),
  };
}
export function getGraphMemoryEdgeProgress(from:number,to:number,elapsed:number,delay:number,opening:boolean) {
  const stagger=Math.max(0,Math.min(GRAPH_MEMORY_DELAY_MS,delay));
  return reveal(from,to,elapsed,opening ? 140+stagger : 0,opening ? 280 : 150);
}
import { graphRevealEase } from './graph-entrance';
