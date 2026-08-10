import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const bootstrapUrl = new URL("../public/appearance-bootstrap.js", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);

function runBootstrap(options: {
  storedColor?: string | null;
  storedMode?: string | null;
  systemDark?: boolean;
  storageThrows?: boolean;
  mediaThrows?: boolean;
} = {}) {
  const attributes = new Map<string, string>();
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
    },
    localStorage: { getItem },
    matchMedia: vi.fn(() => {
      if (options.mediaThrows) throw new Error("media unavailable");
      return { matches: options.systemDark ?? false };
    }),
  });

  return attributes;
}

describe("pre-paint appearance bootstrap", () => {
  it("runs a self-hosted blocking script before the application module", () => {
    const index = readFileSync(indexUrl, "utf8");
    const bootstrap = index.indexOf('<script src="/appearance-bootstrap.js"></script>');
    const application = index.indexOf('<script type="module" src="/src/client/main.tsx"></script>');

    expect(bootstrap).toBeGreaterThan(-1);
    expect(bootstrap).toBeLessThan(application);
  });

  it("applies stored Blue and Dark before application startup", () => {
    const attributes = runBootstrap({ storedColor: "blue", storedMode: "dark" });

    expect(attributes.get("data-color-theme")).toBe("blue");
    expect(attributes.get("data-mode")).toBe("dark");
  });

  it("resolves System from the OS preference", () => {
    expect(runBootstrap({ storedMode: "system", systemDark: true }).get("data-mode")).toBe("dark");
    expect(runBootstrap({ storedMode: "system", systemDark: false }).get("data-mode")).toBe("light");
  });

  it("falls back safely to Teal and Light when browser APIs are unavailable", () => {
    const attributes = runBootstrap({ storageThrows: true, mediaThrows: true });

    expect(attributes.get("data-color-theme")).toBe("teal");
    expect(attributes.get("data-mode")).toBe("light");
  });
});
