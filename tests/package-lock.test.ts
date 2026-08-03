import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readJson(relativePath: string) {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"),
  ) as Record<string, unknown>;
}

describe("npm lockfile", () => {
  it("keeps root dependencies synchronized with package.json", () => {
    const manifest = readJson("../package.json") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const lockfile = readJson("../package-lock.json") as {
      packages?: Record<
        string,
        {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        }
      >;
    };
    const rootPackage = lockfile.packages?.[""];

    expect(rootPackage?.dependencies).toEqual(manifest.dependencies);
    expect(rootPackage?.devDependencies).toEqual(manifest.devDependencies);
  });
});
