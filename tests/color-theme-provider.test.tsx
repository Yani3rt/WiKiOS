import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColorThemeProvider, useColorTheme } from "../src/client/color-theme-provider";

function Probe() {
  const { colorTheme } = useColorTheme();
  return createElement("span", { "data-theme": colorTheme }, colorTheme);
}

describe("color theme provider", () => {
  it("provides the initialized theme to descendants", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorThemeProvider, { initialTheme: "violet" }, createElement(Probe)),
    );
    expect(markup).toContain('data-theme="violet"');
  });

  it("initializes the root theme before config overrides and React rendering", () => {
    const main = readFileSync(fileURLToPath(new URL("../src/client/main.tsx", import.meta.url)), "utf8");
    const initialize = main.indexOf("initializeBrowserColorTheme()");
    const configOverrides = main.indexOf("applyThemeVariables(config)");
    const render = main.indexOf("createRoot(rootContainer).render");
    expect(initialize).toBeGreaterThan(-1);
    expect(initialize).toBeLessThan(configOverrides);
    expect(configOverrides).toBeLessThan(render);
  });
});
