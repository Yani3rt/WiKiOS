import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function themeBlock(styles: string, color: "teal" | "blue" | "violet", mode: "light" | "dark") {
  const selector = `:root[data-color-theme="${color}"][data-mode="${mode}"]`;
  const start = styles.indexOf(selector);
  const end = styles.indexOf("\n}", start);
  expect(start, selector).toBeGreaterThan(-1);
  expect(styles.slice(start, start + selector.length + 2), selector).toBe(`${selector} {`);
  return styles.slice(start, end);
}

describe("unified color system", () => {
  it("defines complete light and dark Teal, Blue, and Violet token presets", () => {
    const styles = source("../src/client/globals.css");
    const required = [
      "brand-deep", "brand-deep-hover", "brand-on-deep", "brand-on-deep-muted",
      "brand-on-deep-accent", "brand-deep-border", "brand-deep-control-border",
      "brand-deep-control", "brand-canvas", "brand-surface", "brand-surface-subtle",
      "brand-muted-surface",
      "brand-ink", "brand-muted-ink", "brand-accent", "brand-accent-soft",
      "brand-border", "brand-control-border", "brand-focus-soft", "brand-skeleton",
      "brand-scrollbar", "brand-overlay", "brand-shadow-soft", "brand-shadow-strong",
      "graph-background", "graph-foreground", "graph-muted", "graph-node-default",
      "graph-node-muted", "graph-edge-default", "graph-edge-muted", "graph-label",
      "mini-graph-edge", "mini-graph-edge-hover", "mini-graph-label",
      "mini-graph-label-muted", "mermaid-background", "mermaid-primary",
      "mermaid-primary-text", "mermaid-primary-border", "mermaid-line",
      "mermaid-secondary", "mermaid-tertiary",
    ];
    for (const id of ["teal", "blue", "violet"] as const) {
      for (const mode of ["light", "dark"] as const) {
        const block = themeBlock(styles, id, mode);
        for (const token of required) expect(block, `${id}:${mode}:${token}`).toContain(`--${token}:`);
      }
    }
  });

  it("keeps Sigma renderer colors in its supported hex or rgb formats", () => {
    const styles = source("../src/client/globals.css");
    const rendererTokens = [
      "graph-background",
      "graph-foreground",
      "graph-node-default",
      "graph-node-muted",
      "graph-edge-default",
      "graph-edge-muted",
      "graph-edge-outgoing",
      "graph-edge-incoming",
      "graph-label",
    ];

    for (const token of rendererTokens) {
      const values = [...styles.matchAll(new RegExp(`--${token}:\\s*([^;]+);`, "g"))];
      expect(values.length, token).toBeGreaterThan(0);
      for (const [, value] of values) expect(value.trim(), token).toMatch(/^(#[\da-f]{6}|rgba?\()/i);
    }
  });
});
