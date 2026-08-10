import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const bootstrapUrl = new URL("../public/appearance-bootstrap.js", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);
const manifestUrl = new URL("../public/manifest.json", import.meta.url);

function runBootstrap(options: {
  storedColor?: string | null;
  storedMode?: string | null;
  systemDark?: boolean;
  storageThrows?: boolean;
  mediaThrows?: boolean;
} = {}) {
  const attributes = new Map<string, string>();
  let themeColor = "#faf7f3";
  const getItem = vi.fn((key: string) => {
    if (options.storageThrows) throw new Error("storage unavailable");
    return key === "wikios:color-theme"
      ? options.storedColor ?? null
      : options.storedMode ?? null;
  });

  runInNewContext(readFileSync(bootstrapUrl, "utf8"), {
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          attributes.set(name, value);
        },
      },
      querySelector(selector: string) {
        if (selector !== 'meta[name="theme-color"]') return null;
        return {
          setAttribute(name: string, value: string) {
            if (name === "content") themeColor = value;
          },
        };
      },
    },
    localStorage: { getItem },
    matchMedia: vi.fn(() => {
      if (options.mediaThrows) throw new Error("media unavailable");
      return { matches: options.systemDark ?? false };
    }),
  });

  return { attributes, themeColor };
}

describe("pre-paint appearance bootstrap", () => {
  it("runs a self-hosted blocking script before the application module", () => {
    const index = readFileSync(indexUrl, "utf8");
    const bootstrap = index.indexOf('<script src="/appearance-bootstrap.js"></script>');
    const application = index.indexOf('<script type="module" src="/src/client/main.tsx"></script>');

    expect(bootstrap).toBeGreaterThan(-1);
    expect(bootstrap).toBeLessThan(application);
  });

  it("uses a dark static PWA launch surface and a translucent iOS status bar", () => {
    const index = readFileSync(indexUrl, "utf8");
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
      background_color: string;
      theme_color: string;
    };

    expect(manifest).toMatchObject({
      background_color: "#142426",
      theme_color: "#142426",
    });
    expect(index).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    );
    expect(index).not.toContain("#faf7f3");
  });

  it("applies stored Blue and Dark before application startup", () => {
    const attributes = runBootstrap({ storedColor: "blue", storedMode: "dark" });

    expect(attributes.attributes.get("data-color-theme")).toBe("blue");
    expect(attributes.attributes.get("data-mode")).toBe("dark");
    expect(attributes.themeColor).toBe("#141d2b");
  });

  it("resolves System from the OS preference", () => {
    expect(runBootstrap({ storedMode: "system", systemDark: true }).attributes.get("data-mode")).toBe("dark");
    expect(runBootstrap({ storedMode: "system", systemDark: false }).attributes.get("data-mode")).toBe("light");
  });

  it("falls back safely to Teal and Light when browser APIs are unavailable", () => {
    const attributes = runBootstrap({ storageThrows: true, mediaThrows: true });

    expect(attributes.attributes.get("data-color-theme")).toBe("teal");
    expect(attributes.attributes.get("data-mode")).toBe("light");
    expect(attributes.themeColor).toBe("#ebf6f7");
  });
});
