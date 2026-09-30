// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceStart } from "../src/components/workspace-start";

let root: Root;
let container: HTMLDivElement;
const onSelect = vi.fn();
const onBrowseNotes = vi.fn();
const pages = Array.from({length: 8}, (_, index) => ({
  slug: `Note${index}`, title: `Note ${index}`, file: index ? `Projects/Research/Note${index}.md` : "Note0.md", modifiedAt: 1,
}));
const render = (recentSlugs: string[]) => act(async () => root.render(
  <WorkspaceStart pages={pages} recentSlugs={recentSlugs} readingProgress={{Note0: 42}} onSelect={onSelect} onBrowseNotes={onBrowseNotes} />,
));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks();
});
it("shows the latest existing note separately and five unique recent notes in reading order", async () => {
  await render(["deleted", "Note0", "Note1", "Note1", "Note2", "Note3", "Note4", "Note5", "Note6", "Note7"]);
  expect(container.querySelector(".workspace-resume")?.textContent).toContain("Note 0");
  expect(container.querySelector(".workspace-resume")?.textContent).toContain("42% read");
  expect(container.querySelector(".workspace-resume")?.textContent).toContain("Vault root");
  const recent = [...container.querySelectorAll<HTMLButtonElement>(".workspace-recent-note")];
  expect(recent.map(button => button.dataset.slug)).toEqual(["Note1", "Note2", "Note3", "Note4", "Note5"]);
  expect(recent[0].textContent).toContain("Projects/Research");
  await act(async () => container.querySelector<HTMLButtonElement>(".workspace-resume")!.click());
  expect(onSelect).toHaveBeenLastCalledWith("Note0");
  await act(async () => recent[2].click());
  expect(onSelect).toHaveBeenLastCalledWith("Note3");
});
it("offers browsing instead of fabricated notes when history is empty or all notes were deleted", async () => {
  for (const history of [[], ["deleted"]]) {
    await render(history);
    expect(container.querySelector(".workspace-resume")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
    const browse = container.querySelector<HTMLButtonElement>("button")!;
    expect(browse.textContent).toBe("Browse notes");
    await act(async () => browse.click());
  }
  expect(onBrowseNotes).toHaveBeenCalledTimes(2);
});
it("omits the recent section for a single note and does not invent unknown progress", async () => {
  await render(["Note1"]);
  expect(container.querySelector(".workspace-resume")?.textContent).toContain("Note 1");
  expect(container.textContent).not.toContain("% read");
  expect(container.textContent).not.toContain("Recent notes");
});
