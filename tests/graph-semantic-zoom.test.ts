import { expect, it } from 'vitest';
import { getGraphDetailLevel, getGraphNeighborhoodOpacity, isGraphLabelEligible } from '../src/client/graph-semantic-zoom';
it('uses 1.4x and 2.3x boundaries with hysteresis rather than flickering near them',()=>{
  expect(getGraphDetailLevel(1.49,'overview')).toBe('overview');
  expect(getGraphDetailLevel(1.51,'overview')).toBe('neighborhood');
  expect(getGraphDetailLevel(1.31,'neighborhood')).toBe('neighborhood');
  expect(getGraphDetailLevel(1.29,'neighborhood')).toBe('overview');
  expect(getGraphDetailLevel(2.41,'neighborhood')).toBe('detail');
  expect(getGraphDetailLevel(2.21,'detail')).toBe('detail');
  expect(getGraphDetailLevel(2.19,'detail')).toBe('neighborhood');
  expect(getGraphDetailLevel(3,'overview')).toBe('detail');
  expect(getGraphDetailLevel(1,'detail')).toBe('overview');
});
it('fails safely for invalid magnification and fades region opacity before close detail',()=>{
  for(const value of [NaN,Infinity,-1,0]) expect(getGraphDetailLevel(value,'overview')).toBe('overview');
  expect(getGraphNeighborhoodOpacity(1)).toBe(1);
  expect(getGraphNeighborhoodOpacity(1.8)).toBeGreaterThan(0);
  expect(getGraphNeighborhoodOpacity(2.4)).toBe(0);
});
it('uses hubs in overview, persistent labels at neighborhood scale, all notes in detail, and always respects active contexts',()=>{
  const node={persistent:false,hub:false,independent:false,context:false};
  expect(isGraphLabelEligible('overview',node)).toBe(false);
  expect(isGraphLabelEligible('overview',{...node,hub:true})).toBe(true);
  expect(isGraphLabelEligible('overview',{...node,independent:true})).toBe(true);
  expect(isGraphLabelEligible('neighborhood',{...node,persistent:true})).toBe(true);
  expect(isGraphLabelEligible('detail',node)).toBe(true);
  expect(isGraphLabelEligible('overview',{...node,context:true})).toBe(true);
});
