import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("uses a frozen install during first-run and honors skip-start", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "wiki-launcher-"));
  try {
    const executable = path.join(temp, "pnpm.cjs");
    const log = path.join(temp, "calls.jsonl");
    await writeFile(executable, 'require("node:fs").appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2))+"\\n");');
    await promisify(execFile)(process.execPath, ["scripts/first-run.mjs", "--skip-start"], {
      env: { ...process.env, npm_execpath: executable, npm_node_execpath: process.execPath, CALL_LOG: log },
    });
    expect((await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line))).toEqual([
      ["install", "--frozen-lockfile", "--prefer-offline"],
    ]);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
