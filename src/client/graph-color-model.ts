import type { GraphColorSource } from '@/lib/wiki-shared';

export interface GraphColorPreferences { mode: 'topics' | 'folders' | 'none'; priority: string[]; }
export interface GraphColorGroup { id: string; label: string; color: string; count: number; }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const palette = ['#82cdbc', '#e4b778', '#91b7ec', '#db969f', '#bea6e0', '#b7cb85', '#80c5d6', '#d8b295'];
function groupColor(index: number): string {
  if (index < palette.length) return palette[index];
  const hue = (index * 137.508) % 360;
  const lightness = 0.69;
  const amplitude = 0.48 * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
const clean = (items: unknown): string[] => Array.isArray(items) ? [...new Set(items.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 200).map(x => x.trim()))].slice(0, 500) : [];
function browserStorage(): Storage | null { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }
const key = (vaultId: string) => `wiki-os:graph-colors:${encodeURIComponent(vaultId)}`;
export function readGraphColorPreferences(vaultId: string, topics: string[], storage: Storage | null = browserStorage()): GraphColorPreferences {
  const fallback: GraphColorPreferences = { mode: 'topics', priority: clean(topics).sort((a, b) => a.localeCompare(b)) };
  try {
    const raw = storage?.getItem(key(vaultId));
    if (!raw || raw.length > 200_000) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || !['topics', 'folders', 'none'].includes(parsed.mode) || !Array.isArray(parsed.priority)) return fallback;
    return { mode: parsed.mode, priority: clean(parsed.priority) };
  } catch { return fallback; }
}
export function writeGraphColorPreferences(vaultId: string, preferences: GraphColorPreferences, storage: Storage | null = browserStorage()) {
  try { storage?.setItem(key(vaultId), JSON.stringify({ mode: preferences.mode, priority: clean(preferences.priority) })); } catch { /* In-memory controls still work. */ }
}
export function buildGraphColorGroups(sources: Record<string, GraphColorSource>, preferences: GraphColorPreferences) {
  const labels = preferences.mode === 'topics' ? preferences.priority : preferences.mode === 'folders'
    ? [...new Set(Object.values(sources).flatMap(source => source.folder ? [source.folder] : []))].sort((a, b) => a.localeCompare(b)) : [];
  // Color identity stays stable when the user reorders priority.
  const ordered = [...labels].sort((a, b) => a.localeCompare(b));
  const groups = new Map<string, GraphColorGroup>(labels.map(label => [label, {
    id: label, label, color: groupColor(ordered.indexOf(label)), count: 0,
  }]));
  const neutral: GraphColorGroup = { id: '', label: preferences.mode === 'none' ? 'All notes' : 'Unassigned', color: '#9ba9b2', count: 0 };
  const assignments = new Map<string, GraphColorGroup>();
  for (const [slug, source] of Object.entries(sources)) {
    const label = preferences.mode === 'topics' ? labels.find(label => source.topics.includes(label)) : preferences.mode === 'folders' ? source.folder : null;
    const group = (label ? groups.get(label) : null) ?? neutral;
    group.count++; assignments.set(slug, group);
  }
  return { assignments, groups: [...groups.values(), neutral].filter(group => group.count > 0) };
}
