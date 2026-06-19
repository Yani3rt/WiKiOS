import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("development server launcher", () => {
  it("resolves the public tsx CLI export", async () => {
    const source = await readFile(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8");

    expect(source).toContain('require.resolve("tsx/cli")');
    expect(source).not.toContain('require.resolve("tsx/dist/cli.mjs")');
  });
});
