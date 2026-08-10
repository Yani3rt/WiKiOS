import { browserThemeStorage } from "./color-theme";

export const THEME_MODE_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemeModePreference = (typeof THEME_MODE_PREFERENCES)[number];
export type ResolvedThemeMode = Exclude<ThemeModePreference, "system">;

export const DEFAULT_THEME_MODE_PREFERENCE: ThemeModePreference = "system";
export const THEME_MODE_STORAGE_KEY = "wikios:theme-mode";

interface StorageReader { getItem(key: string): string | null; }
interface StorageWriter { setItem(key: string, value: string): void; }
interface ThemeRoot { setAttribute(name: string, value: string): void; }
export interface ColorSchemeMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: (event: MediaQueryListEvent) => void): void;
  removeEventListener?(type: "change", listener: (event: MediaQueryListEvent) => void): void;
}
export interface ThemeModeInitialization {
  preference: ThemeModePreference;
  resolvedMode: ResolvedThemeMode;
}

export function parseThemeModePreference(value: string | null): ThemeModePreference {
  return THEME_MODE_PREFERENCES.includes(value as ThemeModePreference)
    ? (value as ThemeModePreference)
    : DEFAULT_THEME_MODE_PREFERENCE;
}

export function readStoredThemeModePreference(storage: StorageReader | null): ThemeModePreference {
  if (!storage) return DEFAULT_THEME_MODE_PREFERENCE;
  try { return parseThemeModePreference(storage.getItem(THEME_MODE_STORAGE_KEY)); }
  catch { return DEFAULT_THEME_MODE_PREFERENCE; }
}

export function persistThemeModePreference(storage: StorageWriter | null, mode: ThemeModePreference) {
  if (!storage) return false;
  try { storage.setItem(THEME_MODE_STORAGE_KEY, mode); return true; }
  catch { return false; }
}

export function resolveThemeMode(
  preference: ThemeModePreference,
  media: Pick<ColorSchemeMediaQuery, "matches"> | null,
): ResolvedThemeMode {
  if (preference !== "system") return preference;
  return media?.matches ? "dark" : "light";
}

export function applyResolvedThemeMode(root: ThemeRoot, mode: ResolvedThemeMode) {
  root.setAttribute("data-mode", mode);
}

export function browserColorSchemeMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try { return window.matchMedia("(prefers-color-scheme: dark)"); }
  catch { return null; }
}

export function initializeBrowserThemeMode(
  root: ThemeRoot = document.documentElement,
  storage: StorageReader | null = browserThemeStorage(),
  media: Pick<ColorSchemeMediaQuery, "matches"> | null = browserColorSchemeMediaQuery(),
): ThemeModeInitialization {
  const preference = readStoredThemeModePreference(storage);
  const resolvedMode = resolveThemeMode(preference, media);
  applyResolvedThemeMode(root, resolvedMode);
  return { preference, resolvedMode };
}

export function subscribeToSystemTheme(
  media: ColorSchemeMediaQuery | null,
  listener: (event: MediaQueryListEvent) => void,
) {
  if (!media?.addEventListener || !media.removeEventListener) return () => undefined;
  media.addEventListener("change", listener);
  return () => media.removeEventListener?.("change", listener);
}
