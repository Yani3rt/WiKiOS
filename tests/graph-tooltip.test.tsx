import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('sigma', () => ({ default: class Sigma {} }));
import { NodeTooltip } from '../src/client/routes/graph-route';
const node = { label: 'Knowledge management', color: '#aabbcc', categories: ['Knowledge'], connectionCount: 14, wordCount: 420 };
it('renders a compact title and a single metadata row', () => {
  const html = renderToStaticMarkup(<NodeTooltip node={node} position={{x:100,y:100}} resolvedMode="dark" />);
  expect(html).toContain('role="tooltip"');
  expect(html).toContain('width:max-content');
  expect(html).toContain('max-width:min(320px, calc(100% - 24px))');
  expect(html).toContain('Knowledge management');
  expect(html).toContain('Knowledge');
  expect(html).toContain('14 connections');
  expect(html).toContain('2 min read');
  expect(html).not.toContain('420 words');
});
it('handles singular connections and short notes without expanding the card', () => {
  const html = renderToStaticMarkup(<NodeTooltip node={{...node, connectionCount:1, wordCount:0}} position={{x:9999,y:9999}} resolvedMode="light" />);
  expect(html).toContain('1 connection');
  expect(html).toContain('1 min read');
  expect(html).toContain('clamp(');
});
it('does not render without a hovered node', () => {
  expect(renderToStaticMarkup(<NodeTooltip node={null} position={{x:0,y:0}} resolvedMode="dark" />)).toBe('');
});
