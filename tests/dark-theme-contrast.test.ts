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

function linearRgb(value: string) {
  const oklch = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/u);
  if (oklch) {
    const [, lightnessText, chromaText, hueText] = oklch;
    const lightness = Number(lightnessText);
    const chroma = Number(chromaText);
    const hue = Number(hueText);
    const a = chroma * Math.cos((hue * Math.PI) / 180);
    const b = chroma * Math.sin((hue * Math.PI) / 180);
    const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
    const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
    const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
    const l = lPrime ** 3;
    const m = mPrime ** 3;
    const s = sPrime ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((channel) => Math.min(1, Math.max(0, channel)));
  }

  const hex = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu);
  expect(hex, `opaque color ${value}`).not.toBeNull();
  return hex!.slice(1).map((channel) => {
    const srgb = Number.parseInt(channel, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
}

function luminance(value: string) {
  const [red, green, blue] = linearRgb(value);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme contrast", () => {
  it("meets text and UI contrast across all six palettes", () => {
    const styles = source("../src/client/globals.css");
    const textPairs = [
      ["brand-ink", "brand-canvas"],
      ["brand-ink", "brand-surface"],
      ["brand-muted-ink", "brand-surface"],
      ["brand-on-deep", "brand-deep"],
      ["brand-on-deep-muted", "brand-deep"],
      ["brand-accent", "brand-surface"],
    ] as const;
    const uiPairs = [
      ["brand-control-border", "brand-surface"],
      ["brand-deep-control-border", "brand-deep"],
      ["brand-focus", "brand-canvas"],
    ] as const;

    for (const color of ["teal", "blue", "violet"] as const) {
      for (const mode of ["light", "dark"] as const) {
        const block = themeBlock(styles, color, mode);
        const value = (token: string) => {
          const sourceToken = token === "brand-focus" ? "brand-accent" : token;
          const match = block.match(new RegExp(`--${sourceToken}:\\s*([^;]+);`));
          expect(match, `${color}:${mode}:${sourceToken}`).not.toBeNull();
          return match![1].trim();
        };
        for (const pair of textPairs) {
          expect(contrast(value(pair[0]), value(pair[1])), `${color}:${mode}:${pair.join(" / ")}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const pair of uiPairs) {
          expect(contrast(value(pair[0]), value(pair[1])), `${color}:${mode}:${pair.join(" / ")}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
