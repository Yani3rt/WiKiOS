import { expect, it } from 'vitest';
import { focusVisibility, focusColor } from '../src/client/graph-focus-transition';
it('fades from the current visibility without snapping on interruption', () => {
  const halfway = focusVisibility(1, 0, 0.5);
  expect(halfway).toBe(0.5);
  expect(focusVisibility(halfway, 1, 0)).toBe(halfway);
  expect(focusVisibility(halfway, 1, 1)).toBe(1);
});
it('holds returning links back briefly and settles at the same endpoint', () => {
  expect(focusVisibility(0, 1, 0.1, 0.16)).toBe(0);
  expect(focusVisibility(0, 1, 0.5, 0.16)).toBeLessThan(focusVisibility(0, 1, 0.5));
  expect(focusVisibility(0, 1, 1, 0.16)).toBe(1);
});
it('fades the entire node including its white shader core', () => {
  expect(focusColor('#aabbcc', 0)).toBe('rgba(170,187,204,0)');
  expect(focusColor('#aabbcc', 0.5)).toBe('rgba(170,187,204,0.5)');
  expect(focusColor('#aabbcc', 1)).toBe('#aabbcc');
});
