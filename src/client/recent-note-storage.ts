import {
  COMMAND_PALETTE_RECENTS_KEY,
  parseRecentNoteSlugs,
  serializeRecentNoteSlugs,
} from "./command-palette-model";

export interface RecentNoteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): RecentNoteStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentNoteSlugs(
  storage: RecentNoteStorage | null = browserStorage(),
): string[] {
  if (!storage) return [];
  try {
    return parseRecentNoteSlugs(storage.getItem(COMMAND_PALETTE_RECENTS_KEY));
  } catch {
    return [];
  }
}

export function persistRecentNoteSlugs(
  recents: readonly string[],
  storage: RecentNoteStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(COMMAND_PALETTE_RECENTS_KEY, serializeRecentNoteSlugs(recents));
  } catch {
    // Storage can be unavailable or quota-limited.
  }
}
