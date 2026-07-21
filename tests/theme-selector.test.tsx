import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ColorThemeProvider } from "../src/client/color-theme-provider";
import { ThemeOptions, ThemeSelector } from "../src/components/theme-selector";

describe("ThemeSelector", () => {
  it("renders a named trigger with popup state", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorThemeProvider, { initialTheme: "teal" }, createElement(ThemeSelector)),
    );
    expect(markup).toContain('aria-label="Choose color theme"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders all themes as a labeled radio group with explicit selected state", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeOptions, { selectedTheme: "blue", onSelect: vi.fn() }),
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("Teal");
    expect(markup).toContain("Blue");
    expect(markup).toContain("Violet");
    expect(markup).toMatch(/<input(?=[^>]*value="blue")(?=[^>]*checked)[^>]*>/);
    expect(markup).toContain("Selected");
  });
});
