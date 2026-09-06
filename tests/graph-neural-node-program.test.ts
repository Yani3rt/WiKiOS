import { expect, it } from 'vitest';
import { NEURAL_NODE_FRAGMENT_SHADER } from '../src/client/graph-neural-node-program';
it('keeps GPU picking separate from the feathered visual halo', () => {
  expect(NEURAL_NODE_FRAGMENT_SHADER).toContain('#ifdef PICKING_MODE');
  expect(NEURAL_NODE_FRAGMENT_SHADER).toContain('gl_FragColor = v_color');
  expect(NEURAL_NODE_FRAGMENT_SHADER).toContain('smoothstep');
});
