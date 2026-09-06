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
