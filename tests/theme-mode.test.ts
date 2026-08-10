import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_THEME_MODE_PREFERENCE,
  THEME_MODE_STORAGE_KEY,
  applyResolvedThemeMode,
  initializeBrowserThemeMode,
  parseThemeModePreference,
  persistThemeModePreference,
  readStoredThemeModePreference,
  resolveThemeMode,
  subscribeToSystemTheme,
} from "../src/client/theme-mode";

describe("theme mode model", () => {
  it("supports System, Light, and Dark with System as the fallback", () => {
    expect(DEFAULT_THEME_MODE_PREFERENCE).toBe("system");
    expect(parseThemeModePreference("light")).toBe("light");
    expect(parseThemeModePreference("dark")).toBe("dark");
    expect(parseThemeModePreference("unknown")).toBe("system");
    expect(parseThemeModePreference(null)).toBe("system");
  });

  it("persists preferences without allowing storage failures to escape", () => {
    const storage = { getItem: vi.fn(() => "dark"), setItem: vi.fn() };
    expect(readStoredThemeModePreference(storage)).toBe("dark");
    expect(persistThemeModePreference(storage, "light")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_MODE_STORAGE_KEY, "light");
    expect(readStoredThemeModePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
    expect(persistThemeModePreference({ setItem: () => { throw new Error("quota"); } }, "dark")).toBe(false);
  });

  it("resolves System from the media query and falls back to Light", () => {
    expect(resolveThemeMode("dark", { matches: false })).toBe("dark");
    expect(resolveThemeMode("light", { matches: true })).toBe("light");
    expect(resolveThemeMode("system", { matches: true })).toBe("dark");
    expect(resolveThemeMode("system", { matches: false })).toBe("light");
    expect(resolveThemeMode("system", null)).toBe("light");
  });

  it("initializes data-mode before rendering", () => {
    const root = { setAttribute: vi.fn() };
    expect(initializeBrowserThemeMode(root, { getItem: () => "system" }, { matches: true })).toEqual({
      preference: "system",
      resolvedMode: "dark",
    });
    expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "dark");
    applyResolvedThemeMode(root, "light");
    expect(root.setAttribute).toHaveBeenLastCalledWith("data-mode", "light");
  });

  it("subscribes and removes the same system listener", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const listener = vi.fn();
    const media = { matches: false, addEventListener, removeEventListener };
    const unsubscribe = subscribeToSystemTheme(media, listener);
    expect(addEventListener).toHaveBeenCalledWith("change", listener);
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("change", listener);
  });
});
