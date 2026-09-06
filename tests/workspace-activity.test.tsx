// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceActivity } from "../src/components/workspace-activity";

let root: Root;
let container: HTMLDivElement;
const select = vi.fn();
const pages = [
  { slug: "Alpha", title: "Alpha", file: "Notes/Alpha.md", firstSeenAt: 1000, modifiedAt: 3000 },
  { slug: "Beta", title: "Beta", file: "Notes/Beta.md", firstSeenAt: 2000, modifiedAt: 2000 },
];
const notes = () => [...container.querySelectorAll<HTMLButtonElement>(".activity-note")].map(node => node.getAttribute("data-slug"));
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<WorkspaceActivity pages={pages} recentSlugs={["gone", "Alpha", "Beta"]} onSelect={select} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); select.mockClear(); });
it("sorts additions by first seen and updates by modification without mutating pages", async () => {
  expect(notes()).toEqual(["Beta", "Alpha"]);
  expect(container.textContent).toContain("First seen");
  const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  await act(async () => tabs[1].click());
  expect(notes()).toEqual(["Alpha", "Beta"]);
  expect(container.textContent).toContain("Updated");
  expect(pages[0].slug).toBe("Alpha");
  expect(container.querySelector("time")?.title).toBeTruthy();
});
it("supports arrow keys, linked panels, and opening notes in recent order", async () => {
  const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[2]);
  expect(container.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(tabs[2].id);
  expect(notes()).toEqual(["Alpha", "Beta"]);
  await act(async () => container.querySelector<HTMLButtonElement>(".activity-note")!.click());
  expect(select).toHaveBeenCalledWith("Alpha");
});
it("shows a concise empty state for no recently opened notes", async () => {
  await act(async () => root.render(<WorkspaceActivity pages={pages} recentSlugs={[]} onSelect={select} />));
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click());
  expect(container.textContent).toContain("No recently opened notes");
});
it("bounds large activity lists and resets pagination when switching tabs", async () => {
  const manyPages = Array.from({length: 250}, (_, i) => ({...pages[0], slug: `Note${i}`, title: `Note ${i}`, firstSeenAt: i}));
  await act(async () => root.render(<WorkspaceActivity pages={manyPages} recentSlugs={[]} onSelect={select}/>));
  expect(notes()).toHaveLength(100);
  const more = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Show more");
  await act(async () => more()!.click());
  expect(notes()).toHaveLength(200);
  await act(async () => more()!.click());
  expect(notes()).toHaveLength(250);
  expect(more()).toBeUndefined();
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
  expect(notes()).toHaveLength(100);
});
