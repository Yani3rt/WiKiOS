import { expect, it } from 'vitest';
import { createGraphNeuralActivationIndex, getGraphNeuralSignalFrame, GRAPH_NEURAL_TIMING as timing } from '../src/client/graph-overview-model';

it('orders activation, one signal pass, related-note response and a quiet settled state',()=>{
  const travelStart=timing.chargeMs+timing.ignitionMs;
  const arrival=travelStart+timing.selectionTravelMs;
  expect(getGraphNeuralSignalFrame(timing.chargeMs,0,'selection',false).activeNodeScale).toBeGreaterThan(1);
  for(const elapsed of [0,travelStart,arrival-1,arrival]) {
    expect(getGraphNeuralSignalFrame(elapsed,0,'selection',false).arrivalScale).toBe(1);
  }
  const response=getGraphNeuralSignalFrame(arrival+timing.arrivalMs/2,0,'selection',false);
  expect(response.primaryProgress).toBeNull();
  expect(response.arrivalScale).toBeGreaterThan(1);
  expect(response.complete).toBe(false);
  const settled=getGraphNeuralSignalFrame(arrival+timing.arrivalMs,0,'selection',false);
  expect(settled).toMatchObject({phase:'selected',arrivalScale:1,activeNodeScale:1,complete:true,primaryProgress:null});
  expect(getGraphNeuralSignalFrame(10000,0,'selection',false)).toEqual(settled);
  expect(arrival+timing.arrivalMs+timing.maximumStaggerMs).toBeLessThanOrEqual(1000);
});
it('restrains both activation and response rather than enlarging effects',()=>{
  for(let elapsed=0;elapsed<=1600;elapsed+=10) {
    const frame=getGraphNeuralSignalFrame(elapsed,0,'selection',false);
    expect(frame.activeNodeScale).toBeLessThanOrEqual(1.06);
    expect(frame.arrivalScale).toBeLessThanOrEqual(1.045);
  }
});
it('responds at the other endpoint of an incoming relationship',()=>{
  const index=createGraphNeuralActivationIndex([{source:'related',target:'selected',weight:1}]);
  expect(index.get('selected')?.[0]).toMatchObject({receivingNode:'related',direction:'incoming'});
});
