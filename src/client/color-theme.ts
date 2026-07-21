export const COLOR_THEME_IDS = ["teal", "blue", "violet"] as const;
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

export interface ColorThemeDefinition {
  readonly id: ColorThemeId;
  readonly label: string;
  readonly preview: readonly [deep: string, accent: string, canvas: string];
}

export const COLOR_THEMES: readonly ColorThemeDefinition[] = [
  { id: "teal", label: "Teal", preview: ["#004950", "#00626c", "#ebf6f7"] },
  { id: "blue", label: "Blue", preview: ["#12426d", "#1a588f", "#eef4fb"] },
  { id: "violet", label: "Violet", preview: ["#433567", "#5a4789", "#f4f2fb"] },
] as const;

export const DEFAULT_COLOR_THEME: ColorThemeId = "teal";
export const COLOR_THEME_STORAGE_KEY = "wikios:color-theme";

interface ThemeStorageReader { getItem(key: string): string | null; }
interface ThemeStorageWriter { setItem(key: string, value: string): void; }
interface ThemeRoot { setAttribute(name: string, value: string): void; }

export function parseColorThemeId(value: string | null): ColorThemeId {
  return COLOR_THEME_IDS.includes(value as ColorThemeId)
    ? (value as ColorThemeId)
    : DEFAULT_COLOR_THEME;
}

export function readStoredColorTheme(storage: ThemeStorageReader | null): ColorThemeId {
  if (!storage) return DEFAULT_COLOR_THEME;
  try { return parseColorThemeId(storage.getItem(COLOR_THEME_STORAGE_KEY)); }
  catch { return DEFAULT_COLOR_THEME; }
}

export function persistColorTheme(
  storage: ThemeStorageWriter | null,
  theme: ColorThemeId,
): boolean {
  if (!storage) return false;
  try { storage.setItem(COLOR_THEME_STORAGE_KEY, theme); return true; }
  catch { return false; }
}

export function applyColorTheme(root: ThemeRoot, theme: ColorThemeId) {
  root.setAttribute("data-color-theme", theme);
}

export function browserThemeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; }
  catch { return null; }
}

export function initializeBrowserColorTheme(
  root: ThemeRoot = document.documentElement,
  storage: ThemeStorageReader | null = browserThemeStorage(),
): ColorThemeId {
  const theme = readStoredColorTheme(storage);
  applyColorTheme(root, theme);
  return theme;
}
