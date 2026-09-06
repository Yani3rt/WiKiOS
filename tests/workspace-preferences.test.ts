import { expect, it } from "vitest";
import { readWorkspacePreferences, writeWorkspacePreferences, togglePin, promoteRecent } from "../src/client/workspace-preferences";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
it("keeps preferences isolated per vault and tolerates inaccessible storage", () => {
  const storage = memoryStorage();
  const defaults = readWorkspacePreferences("a", storage);
  expect(defaults).toEqual({ pinnedSlugs: [], recentSlugs: [], scrollPositions: {}, connectionsOpen: true });
  writeWorkspacePreferences("a", { ...defaults, pinnedSlugs: ["Alpha"], connectionsOpen: true }, storage);
  expect(readWorkspacePreferences("a", storage).pinnedSlugs).toEqual(["Alpha"]);
  expect(readWorkspacePreferences("b", storage)).toEqual(defaults);
  const broken = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  expect(readWorkspacePreferences("a", broken)).toEqual(defaults);
  expect(() => writeWorkspacePreferences("a", defaults, broken)).not.toThrow();
});
it("validates malformed data and bounds persisted lists and scroll state", () => {
  const storage = memoryStorage();
  writeWorkspacePreferences("a", readWorkspacePreferences("a", storage), storage);
  const key = [...storage.values.keys()][0];
  storage.values.set(key, JSON.stringify({ pinnedSlugs: ["Alpha", "Alpha", "", 2], recentSlugs: Array.from({ length: 300 }, (_, i) => `Note${i}`), scrollPositions: { good: 32, bad: -1, nope: "4", __proto__: 7 }, connectionsOpen: "yes" }));
  const value = readWorkspacePreferences("a", storage);
  expect(value.pinnedSlugs).toEqual(["Alpha"]);
  expect(value.recentSlugs.length).toBeLessThanOrEqual(100);
  expect(value.scrollPositions).toEqual({ good: 32 });
  expect(value.connectionsOpen).toBe(true);
  storage.values.set(key, "{");
  expect(readWorkspacePreferences("a", storage).pinnedSlugs).toEqual([]);
});
it("toggles pins and promotes recent notes without mutating input", () => {
  const slugs = ["Alpha", "Beta"];
  expect(togglePin(slugs, "Alpha")).toEqual(["Beta"]);
  expect(togglePin(slugs, "Gamma")).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(promoteRecent(slugs, "Beta")).toEqual(["Beta", "Alpha"]);
  expect(slugs).toEqual(["Alpha", "Beta"]);
});
