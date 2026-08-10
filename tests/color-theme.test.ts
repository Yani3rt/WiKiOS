import { describe, expect, it, vi } from "vitest";

import {
  COLOR_THEMES,
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  applyColorTheme,
  initializeBrowserColorTheme,
  parseColorThemeId,
  persistColorTheme,
  readStoredColorTheme,
} from "../src/client/color-theme";

describe("color theme model", () => {
  it("publishes the exact supported catalog and falls back to Teal", () => {
    expect(COLOR_THEMES.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "teal", label: "Teal" },
      { id: "blue", label: "Blue" },
      { id: "violet", label: "Violet" },
    ]);
    expect(DEFAULT_COLOR_THEME).toBe("teal");
    expect(parseColorThemeId("blue")).toBe("blue");
    expect(parseColorThemeId("unknown")).toBe("teal");
    expect(parseColorThemeId(null)).toBe("teal");
  });

  it("publishes exact previews for light and dark modes", () => {
    expect(COLOR_THEMES.map(({ id, preview }) => ({ id, preview }))).toEqual([
      { id: "teal", preview: { light: ["#004950", "#00626c", "#ebf6f7"], dark: ["#101f21", "#67bfc6", "#18282a"] } },
      { id: "blue", preview: { light: ["#12426d", "#1a588f", "#eef4fb"], dark: ["#111b2a", "#7eb5ef", "#192333"] } },
      { id: "violet", preview: { light: ["#433567", "#5a4789", "#f4f2fb"], dark: ["#1d1828", "#b09be8", "#262032"] } },
    ]);
  });

  it("reads and writes storage without allowing storage errors to escape", () => {
    const storage = { getItem: vi.fn(() => "violet"), setItem: vi.fn() };
    expect(readStoredColorTheme(storage)).toBe("violet");
    expect(persistColorTheme(storage, "blue")).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(COLOR_THEME_STORAGE_KEY, "blue");

    expect(readStoredColorTheme({ getItem: () => { throw new Error("blocked"); } })).toBe("teal");
    expect(persistColorTheme({ setItem: () => { throw new Error("quota"); } }, "violet")).toBe(false);
  });

  it("applies the selected ID and initializes storage before rendering", () => {
    const root = { setAttribute: vi.fn() };
    applyColorTheme(root, "blue");
    expect(root.setAttribute).toHaveBeenCalledWith("data-color-theme", "blue");

    root.setAttribute.mockClear();
    expect(initializeBrowserColorTheme(root, { getItem: () => "violet" })).toBe("violet");
    expect(root.setAttribute).toHaveBeenCalledWith("data-color-theme", "violet");
  });
});
