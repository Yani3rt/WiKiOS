import type { GraphColorSource } from '@/lib/wiki-shared';

export interface GraphColorPreferences { mode: 'topics' | 'folders' | 'none'; priority: string[]; }
export interface GraphColorGroup { id: string; label: string; color: string; count: number; }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
type Color = [number, number, number];
function colorHash(label: string): number {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i++) hash = Math.imul(hash ^ label.charCodeAt(i), 16777619);
  // Mix the final bits so near-identical names do not get adjacent hues.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
function hueColor(hue: number, lightness: number): Color {
  const amplitude = 0.72 * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}
const hexColor = (color: Color) => `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
const colorDistance = (first: Color, second: Color) => first.reduce((sum, channel, index) => sum + (channel - second[index]) ** 2, 0);
const colorCandidates = Array.from({ length: 48 }, (_, index) => hueColor(Math.floor(index / 2) * 15, index % 2 === 0 ? 0.46 : 0.62));
function sourceColors(labels: string[]) {
  const colors = new Map<string, string>();
  const assigned: Color[] = [];
  const nearest = colorCandidates.map(() => Infinity);
  // Resolve only near collisions, and always against the complete source universe.
  // Priority edits stay stable; adding source categories can resolve collisions anew.
  for (const label of [...new Set(labels)].sort()) {
    const hash = colorHash(label);
    let color = hueColor((hash % 3600) / 10, 0.54 + ((hash >>> 16) % 3) * 0.04);
    let distance = assigned.reduce((closest, other) => Math.min(closest, colorDistance(color, other)), Infinity);
    if (distance < 64 ** 2) {
      for (let offset = 0; offset < colorCandidates.length; offset++) {
        const index = (hash + offset) % colorCandidates.length;
        if (nearest[index] > distance) {
          color = colorCandidates[index];
          distance = nearest[index];
        }
      }
    }
    colors.set(label, hexColor(color));
    assigned.push(color);
    colorCandidates.forEach((candidate, index) => { nearest[index] = Math.min(nearest[index], colorDistance(candidate, color)); });
  }
  return colors;
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
  const universe = preferences.mode === 'topics' ? Object.values(sources).flatMap(source => source.topics)
    : preferences.mode === 'folders' ? Object.values(sources).flatMap(source => source.folder ? [source.folder] : []) : [];
  const colors = sourceColors(universe);
  const labels = preferences.mode === 'topics' ? preferences.priority : preferences.mode === 'folders'
    ? [...new Set(Object.values(sources).flatMap(source => source.folder ? [source.folder] : []))].sort((a, b) => a.localeCompare(b)) : [];
  const groups = new Map<string, GraphColorGroup>(labels.filter(label => colors.has(label)).map(label => [label, {
    id: label, label, color: colors.get(label)!, count: 0,
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
