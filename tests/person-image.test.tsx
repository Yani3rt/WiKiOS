// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePersonImage } from "../src/client/use-person-image";

let root: Root;
let container: HTMLDivElement;
const pending: Array<(response: Response) => void> = [];
function Portrait({ name }: { name: string | null }) {
  const url = usePersonImage(name);
  return <output>{url ?? "none"}</output>;
}
async function show(name: string | null) { await act(async () => root.render(<Portrait name={name} />)); }
async function respond(status: number, body = {}) {
  await act(async () => pending.shift()!(new Response(JSON.stringify(body), { status })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); pending.length = 0;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("never displays the previous person's portrait while the next request is pending", async () => {
  await show("Ada"); await respond(200, { thumbnail: { source: "ada.jpg" } });
  expect(container.textContent).toBe("ada.jpg");
  await show("Grace"); expect(container.textContent).toBe("none");
  await respond(200, { thumbnail: { source: "grace.jpg" } });
  expect(container.textContent).toBe("grace.jpg");
});
it.each([429, 500, 503])("retries transient HTTP %s failures on the next visit", async status => {
  await show("Ada"); await respond(status); await show(null); await show("Ada");
  expect(pending).toHaveLength(1);
  await respond(200, { thumbnail: { source: "ada.jpg" } });
  expect(container.textContent).toBe("ada.jpg");
});
it("expires missing portraits rather than remembering misses forever", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05"));
  await show("Ada"); await respond(404); await show(null); await show("Ada");
  expect(pending).toHaveLength(0);
  await show(null); vi.setSystemTime(new Date("2026-09-07")); await show("Ada");
  expect(pending).toHaveLength(1);
});
it("ignores a stale response even if the transport ignores abort", async () => {
  await show("Ada"); await show("Grace");
  await respond(200, { thumbnail: { source: "ada.jpg" } });
  expect(container.textContent).toBe("none");
  await respond(200, { thumbnail: { source: "grace.jpg" } });
  expect(container.textContent).toBe("grace.jpg");
});
it("tolerates corrupt stored cache values", async () => {
  localStorage.setItem("wiki-os:person-images", "null");
  await show("Ada"); await respond(200, { thumbnail: { source: "ada.jpg" } });
  expect(container.textContent).toBe("ada.jpg");
});
