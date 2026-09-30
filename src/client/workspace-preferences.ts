export interface WorkspacePreferences {
  pinnedSlugs: string[];
  recentSlugs: string[];
  scrollPositions: Record<string, number>;
  readingProgress: Record<string, number>;
  connectionsOpen: boolean;
  sidebarWidth: number;
}

export interface WorkspacePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAX_ITEMS = 100;
const MAX_SERIALIZED_LENGTH = 300_000;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 480;

export function clampSidebarWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value)))
    : 304;
}
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
  const readingProgress: Record<string, number> = {};
  if (source.readingProgress && typeof source.readingProgress === "object" && !Array.isArray(source.readingProgress)) {
    for (const [slug, progress] of Object.entries(source.readingProgress).slice(0, MAX_ITEMS)) {
      if (validSlug(slug) && !["__proto__", "constructor", "prototype"].includes(slug) && typeof progress === "number" && Number.isFinite(progress) && progress >= 0) {
        readingProgress[slug] = Math.round(Math.min(progress, 100));
      }
    }
  }
  return {
    pinnedSlugs: cleanSlugs(source.pinnedSlugs),
    recentSlugs: cleanSlugs(source.recentSlugs),
    scrollPositions,
    readingProgress,
    connectionsOpen: typeof source.connectionsOpen === "boolean" ? source.connectionsOpen : true,
    sidebarWidth: clampSidebarWidth(source.sidebarWidth),
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

/** Capture the reading offset and its fraction of the available scroll range. */
export function recordReadingPosition(
  preferences: WorkspacePreferences,
  slug: string,
  {scrollTop, scrollHeight, clientHeight}: {scrollTop: number; scrollHeight: number; clientHeight: number},
): WorkspacePreferences {
  const range = scrollHeight - clientHeight;
  return {
    ...preferences,
    scrollPositions: {...preferences.scrollPositions, [slug]: Math.max(0, scrollTop)},
    readingProgress: range > 0
      ? {...preferences.readingProgress, [slug]: Math.round(Math.max(0, Math.min(1, scrollTop / range)) * 100)}
      : preferences.readingProgress,
  };
}
