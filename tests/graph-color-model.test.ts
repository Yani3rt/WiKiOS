import { describe, expect, it } from 'vitest';
import { buildGraphColorGroups, readGraphColorPreferences, writeGraphColorPreferences } from '../src/client/graph-color-model';

const sources = {
  a: { topics: ['Writing', 'Research'], folder: 'Notes' },
  b: { topics: ['Research'], folder: null },
  c: { topics: [], folder: 'Notes' },
};
describe('graph color ownership', () => {
  it('uses configured priority rather than tag order and counts every note', () => {
    const result = buildGraphColorGroups(sources, { mode: 'topics', priority: ['Research', 'Writing'] });
    expect(result.assignments.get('a')?.label).toBe('Research');
    expect(result.assignments.get('c')?.label).toBe('Unassigned');
    expect(result.groups.reduce((n, g) => n + g.count, 0)).toBe(3);
  });
  it('keeps unconfigured topics neutral and separates folders from topics', () => {
    expect(buildGraphColorGroups(sources, { mode: 'topics', priority: ['Writing'] }).assignments.get('b')?.label).toBe('Unassigned');
    expect(buildGraphColorGroups(sources, { mode: 'folders', priority: [] }).assignments.get('a')?.label).toBe('Notes');
    expect(buildGraphColorGroups(sources, { mode: 'none', priority: [] }).groups).toHaveLength(1);
  });
  it('isolates vault preferences and tolerates corrupt or blocked storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    writeGraphColorPreferences('one', { mode: 'none', priority: ['Writing'] }, storage);
    expect(readGraphColorPreferences('one', ['Research'], storage).mode).toBe('none');
    expect(readGraphColorPreferences('two', ['Research'], storage)).toEqual({ mode: 'topics', priority: ['Research'] });
    const blocked = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
    expect(readGraphColorPreferences('one', ['Writing', 'Research'], blocked).priority).toEqual(['Research', 'Writing']);
    expect(() => writeGraphColorPreferences('one', { mode: 'none', priority: [] }, blocked)).not.toThrow();
  });
});

it('does not repeat the eight-color palette for additional topics', () => {
  const labels = Array.from({length: 16}, (_, i) => `Topic ${i}`);
  const source = Object.fromEntries(labels.map(label => [label, { topics: [label], folder: null }]));
  const groups = buildGraphColorGroups(source, { mode: 'topics', priority: labels }).groups;
  expect(new Set(groups.map(group => group.color)).size).toBe(16);
});

it.each(['topics', 'folders'] as const)('keeps %s colors attached to names when other groups are removed or added', mode => {
  const source = {
    writing: { topics: ['Writing'], folder: 'Writing' },
    research: { topics: ['Research'], folder: 'Research' },
  };
  const colorForWriting = (input: typeof source | Omit<typeof source, 'research'>, priority: string[]) =>
    buildGraphColorGroups(input, { mode, priority }).assignments.get('writing')!.color;
  const original = colorForWriting(source, ['Research', 'Writing']);
  expect(colorForWriting({ writing: source.writing }, ['Writing'])).toBe(original);
  expect(colorForWriting(source, ['Writing', 'Research'])).toBe(original);
  const expanded = { ...source, art: { topics: ['Art'], folder: 'Art' } };
  expect(colorForWriting(expanded, ['Art', 'Research', 'Writing'])).toBe(original);
});

it('uses saturated category cores instead of near-neutral pastels', () => {
  const labels = ['Writing', 'Research', 'Design', 'Projects', 'Ideas', 'People', 'Books', 'Archive'];
  const source = Object.fromEntries(labels.map(label => [label, { topics: [label], folder: label }]));
  const groups = buildGraphColorGroups(source, { mode: 'topics', priority: labels }).groups;
  for (const group of groups) {
    const channels = group.color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255);
    const high = Math.max(...channels), low = Math.min(...channels);
    const lightness = (high + low) / 2;
    const saturation = (high - low) / (1 - Math.abs(2 * lightness - 1));
    expect(saturation, group.label).toBeGreaterThanOrEqual(0.65);
    expect(lightness, group.label).toBeLessThanOrEqual(0.63);
  }
  expect(new Set(groups.map(group => group.color)).size).toBe(labels.length);
});

const vaultTopics = ['Ai', 'Apps', 'Development', 'Excalidraw', 'Family', 'Git', 'Home Assistant', 'Home Automation', 'Homebrew', 'Macos', 'Networking', 'Obsidian', 'Projects', 'Prompts', 'Research', 'Tools', 'Vault'];
const vaultSources = Object.fromEntries(vaultTopics.map(topic => [topic, { topics: [topic], folder: topic }]));
const rgb = (color: string) => color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16));
function hue(color: string) {
  const [red, green, blue] = rgb(color);
  const high = Math.max(red, green, blue), range = high - Math.min(red, green, blue);
  if (!range) return 0;
  if (high === red) return (((green - blue) / range) * 60 + 360) % 360;
  return high === green ? ((blue - red) / range + 2) * 60 : ((red - green) / range + 4) * 60;
}

it.each(['topics', 'folders'] as const)('separates near-identical %s colors across the full source universe', mode => {
  const { assignments } = buildGraphColorGroups(vaultSources, { mode, priority: vaultTopics });
  for (const [first, second] of [['Ai', 'Development'], ['Family', 'Home Automation'], ['Apps', 'Projects']]) {
    const difference = Math.abs(hue(assignments.get(first)!.color) - hue(assignments.get(second)!.color));
    expect(Math.min(difference, 360 - difference), `${first} / ${second}`).toBeGreaterThanOrEqual(30);
  }
  expect(new Set([...assignments.values()].map(group => group.color)).size).toBe(17);
});

it('resolves colors against inactive source topics rather than enabled priorities', () => {
  const all = buildGraphColorGroups(vaultSources, { mode: 'topics', priority: vaultTopics });
  const edited = buildGraphColorGroups(vaultSources, { mode: 'topics', priority: ['Projects', 'Home Automation', 'Development'] });
  for (const topic of ['Projects', 'Home Automation', 'Development']) {
    expect(edited.assignments.get(topic)!.color).toBe(all.assignments.get(topic)!.color);
  }
  const restored = buildGraphColorGroups(vaultSources, { mode: 'topics', priority: [...vaultTopics].reverse() });
  for (const topic of vaultTopics) expect(restored.assignments.get(topic)!.color).toBe(all.assignments.get(topic)!.color);
});

it('resolves collisions deterministically regardless of source traversal order', () => {
  const all = buildGraphColorGroups(vaultSources, { mode: 'topics', priority: vaultTopics });
  const reversed = buildGraphColorGroups(Object.fromEntries(Object.entries(vaultSources).reverse()), { mode: 'topics', priority: vaultTopics });
  for (const topic of vaultTopics) expect(reversed.assignments.get(topic)!.color).toBe(all.assignments.get(topic)!.color);
});
