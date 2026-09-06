import { expect, it } from 'vitest';
import { createGraphViewCache, graphTopologyKey } from '../src/client/graph-view-state';

const data = {nodes:[{slug:'a'},{slug:'b'}], edges:[{source:'a',target:'b'}]};
const state = {
  layoutReady:true, focusedSlug:'a', detailPanelCollapsed:true, activeGroup:'topic:ai',
  search:{query:'a',indexOpen:true,visibleResultCount:20},
  camera:{x:.4,y:.6,ratio:.7,angle:0},
  positions:{a:{x:10,y:20},b:{x:30,y:40}},
};
it('restores the full exploration state only for the same vault and topology', () => {
  const cache=createGraphViewCache();
  const key=graphTopologyKey(data);
  cache.save('vault-a',key,state);
  expect(cache.read('vault-a',key)).toEqual(state);
  expect(cache.read('vault-b',key)).toBeNull();
  expect(cache.read('vault-a',graphTopologyKey({...data,nodes:[{slug:'b'}]}))).toBeNull();
});
it('ignores response ordering but invalidates changed relationships', () => {
  expect(graphTopologyKey(data)).toBe(graphTopologyKey({...data,nodes:[...data.nodes].reverse()}));
  expect(graphTopologyKey(data)).not.toBe(graphTopologyKey({...data,edges:[{source:'b',target:'a'}]}));
});
it('replaces old snapshots on each departure', () => {
  const cache=createGraphViewCache();
  cache.save('v','key',state);
  cache.save('v','key',{...state,focusedSlug:null,camera:{...state.camera,ratio:2}});
  expect(cache.read('v','key')?.focusedSlug).toBeNull();
  expect(cache.read('v','key')?.camera.ratio).toBe(2);
});

it('retains whether layout finished so a StrictMode cleanup cannot skip the worker', () => {
  const cache=createGraphViewCache();
  cache.save('v','key',{...state,layoutReady:false});
  expect(cache.read('v','key')?.layoutReady).toBe(false);
});
