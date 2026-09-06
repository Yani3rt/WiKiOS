export interface WorkspacePreferences {
  pinnedSlugs: string[];
  recentSlugs: string[];
  scrollPositions: Record<string, number>;
  connectionsOpen: boolean;
}

export interface WorkspacePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAX_ITEMS = 100;
const MAX_SERIALIZED_LENGTH = 300_000;
const validSlug = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 1024;

function cleanSlugs(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(validSlug))].slice(0, MAX_ITEMS) : [];
}

function cleanPreferences(value: unknown): WorkspacePreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const scrollPositions: Record<string, number> = {};
  if (source.scrollPositions && typeof source.scrollPositions === "object" && !Array.isArray(source.scrollPositions)) {
    for (const [slug, position] of Object.entries(source.scrollPositions)) {
      if (Object.keys(scrollPositions).length >= MAX_ITEMS) break;
      if (validSlug(slug) && !["__proto__", "constructor", "prototype"].includes(slug) && typeof position === "number" && Number.isFinite(position) && position >= 0) {
        scrollPositions[slug] = Math.min(position, 100_000_000);
      }
    }
  }
  return {
    pinnedSlugs: cleanSlugs(source.pinnedSlugs),
    recentSlugs: cleanSlugs(source.recentSlugs),
    scrollPositions,
    connectionsOpen: typeof source.connectionsOpen === "boolean" ? source.connectionsOpen : true,
  };
}

function browserStorage(): WorkspacePreferenceStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

function storageKey(vaultId: string): string {
  return `wiki-os:workspace-preferences:${encodeURIComponent(vaultId)}`;
}

export function readWorkspacePreferences(vaultId: string, storage: WorkspacePreferenceStorage | null = browserStorage()): WorkspacePreferences {
  try {
    const raw = storage?.getItem(storageKey(vaultId));
    return cleanPreferences(raw && raw.length <= MAX_SERIALIZED_LENGTH ? JSON.parse(raw) : null);
  } catch { return cleanPreferences(null); }
}

export function writeWorkspacePreferences(vaultId: string, preferences: WorkspacePreferences, storage: WorkspacePreferenceStorage | null = browserStorage()): void {
  try { storage?.setItem(storageKey(vaultId), JSON.stringify(cleanPreferences(preferences))); }
  catch { /* Preferences remain usable when storage is unavailable or full. */ }
}

export function togglePin(slugs: readonly string[], slug: string): string[] {
  const clean = cleanSlugs(slugs);
  return clean.includes(slug) ? clean.filter(value => value !== slug) : cleanSlugs([...clean, slug]);
}

export function promoteRecent(slugs: readonly string[], slug: string): string[] {
  return cleanSlugs([slug, ...slugs]);
}
