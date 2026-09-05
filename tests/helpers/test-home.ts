import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Integration tests must never read or write the developer's actual vault settings/indexes.
const originalHome = process.env.HOME;
const home = mkdtempSync(path.join(os.tmpdir(), "wiki-test-home-"));
process.env.HOME = home;
afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});
