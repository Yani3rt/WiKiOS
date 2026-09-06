import { afterEach, expect, it } from 'vitest';
import { getGraphData } from '../src/lib/wiki-queries';
import { createQueryFixture } from './helpers/wiki-db';
const fixtures: ReturnType<typeof createQueryFixture>[] = [];
afterEach(() => fixtures.splice(0).forEach(({ db }) => db.close()));
it('exposes only explicit topics and real folder paths for graph color assignment', async () => {
  const f = createQueryFixture(); fixtures.push(f);
  f.addPage('Notes/Tagged.md', '---\ntags: [Research, Writing]\n---\n# Tagged');
  f.addPage('Loose.md', '# Loose\nMemory memory memory');
  const graph = await getGraphData(f.deps);
  expect(graph.colorSources['Notes/Tagged']).toEqual({ topics: ['Research', 'Writing'], folder: 'Notes' });
  expect(graph.colorSources.Loose).toEqual({ topics: [], folder: null });
  expect(graph.vaultId).toBeTruthy();
});

it('retains explicit topic provenance through the real indexer', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { loadIndexedWikiPage } = await import('../src/lib/wiki-indexer');
  const root = await mkdtemp(join(tmpdir(), 'graph-topics-'));
  const f = createQueryFixture(); fixtures.push(f);
  try {
    await writeFile(join(root, 'Tagged.md'), '---\ntopics: [Research, Writing]\n---\n# Note');
    const record = await loadIndexedWikiPage('Tagged.md', {
      requireWikiRoot: () => root,
      syncRuntimeSettings: async () => {},
      requireIndexDbPath: () => ":memory:",
      requireDb: () => f.db,
      getWikiEnvironmentConfig: f.deps.getConfig,
      getPersonOverride: () => null,
    });
    expect(record?.markdown).not.toContain('topics:');
    expect(record?.explicitTopics).toEqual(['Research', 'Writing']);
    const { upsertPageRecord } = await import('../src/lib/wiki-db');
    upsertPageRecord(f.db, record!);
    expect((await getGraphData(f.deps)).colorSources.Tagged.topics).toEqual(['Research', 'Writing']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
