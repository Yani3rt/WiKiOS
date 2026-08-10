import type { ColorThemeId } from "./color-theme";
import type { ResolvedThemeMode } from "./theme-mode";

export const APPEARANCE_THEME_COLORS: Readonly<
  Record<ColorThemeId, Readonly<Record<ResolvedThemeMode, string>>>
> = {
  teal: { light: "#ebf6f7", dark: "#142426" },
  blue: { light: "#eef4fb", dark: "#141d2b" },
  violet: { light: "#f4f2fb", dark: "#201a2b" },
};

interface ThemeColorDocument {
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

export function updateBrowserThemeColor(
  colorTheme: ColorThemeId,
  resolvedMode: ResolvedThemeMode,
  target: ThemeColorDocument = document,
) {
  const color = APPEARANCE_THEME_COLORS[colorTheme][resolvedMode];
  target.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  return color;
}
