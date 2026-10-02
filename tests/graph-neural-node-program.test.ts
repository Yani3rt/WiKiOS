import type { NodeCircleProgram } from 'sigma/rendering';
import { expect, it } from 'vitest';
import { createNeuralNodeProgram } from '../src/client/graph-neural-node-program';

class CircleDefinition {
  getDefinition() {
    return { FRAGMENT_SHADER_SOURCE: '', UNIFORMS: ['u_matrix'], VERTICES: 3 };
  }
}

function shaderFor(mode: 'light' | 'dark') {
  const Program = createNeuralNodeProgram(CircleDefinition as unknown as typeof NodeCircleProgram, mode);
  return Program.prototype.getDefinition().FRAGMENT_SHADER_SOURCE;
}

// Exercise the shader's scalar coverage calculation without a WebGL test dependency.
function sampleAlpha(shader: string, distance: number, colorAlpha = 1) {
  const coverage = shader.split('#else')[1].split(/float alpha\s*=/)[0]
    + `float alpha = ${shader.split(/float alpha\s*=/)[1].split(';')[0]};`;
  const evaluate = new Function('d', 'radius', 'u_correctionRatio', 'colorAlpha', 'min', 'max', 'smoothstep',
    coverage.replace(/\bfloat\b/g, 'let').replace(/v_color\.a/g, 'colorAlpha') + '\nreturn alpha;');
  return evaluate(distance, 10, 1, colorAlpha, Math.min, Math.max,
    (start: number, end: number, value: number) => {
      const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return t * t * (3 - 2 * t);
    }) as number;
}

it('keeps GPU picking at the full node radius in either theme', () => {
  for (const mode of ['light', 'dark'] as const) {
    const shader = shaderFor(mode);
    expect(shader).toContain('if (d > 1.0) discard;');
    expect(shader).toContain('gl_FragColor = v_color;');
  }
});

it('keeps opaque category cores and restrains dark-only halo coverage', () => {
  expect(sampleAlpha(shaderFor('dark'), 0.45)).toBe(1);
  expect(sampleAlpha(shaderFor('light'), 0.45)).toBe(1);
  const darkHalo = sampleAlpha(shaderFor('dark'), 0.75);
  expect(darkHalo).toBeGreaterThan(0);
  expect(darkHalo).toBeLessThanOrEqual(0.10);
  expect(sampleAlpha(shaderFor('light'), 0.75)).toBe(0);
  expect(sampleAlpha(shaderFor('dark'), 1)).toBe(0);
});

it('preserves transparent inputs and does not wash out the category color', () => {
  for (const mode of ['light', 'dark'] as const) {
    const shader = shaderFor(mode);
    expect(sampleAlpha(shader, 0.2, 0)).toBe(0);
    expect(shader).toContain('vec4(v_color.rgb * alpha, alpha)');
  }
});
