// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Component } from "../src/client/routes/explorer-route";
import { AppearanceProvider } from "../src/client/appearance-provider";
import { writeExplorerWorkspaceStorage } from "../src/client/routes/explorer-route";

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
const pages = ["Alpha", "Beta"].map(title => ({ title, slug: title, file: `${title}.md`, modifiedAt: 1 }));
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("scrollTo", () => {});
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  vi.stubGlobal("fetch", async (input: string) => {
    const title = input.split("/").at(-1)!;
    return new Response(JSON.stringify({
      slug: title, title, fileName: `${title}.md`, contentMarkdown: `Body of ${title}`,
      headings: [], hasCodeBlocks: false, modifiedAt: 1, categories: [], neighbors: [],
      isPerson: false, personOverride: null,
    }), { headers: { "content-type": "application/json" } });
  });
  localStorage.clear();
  writeExplorerWorkspaceStorage(localStorage, { tabs: pages, activeSlug: "Alpha" });
  router = createMemoryRouter([{ path: "/explorer/*", loader: () => pages, HydrateFallback: () => null, Component }], { initialEntries: ["/explorer/Alpha"] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<AppearanceProvider initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router} /></AppearanceProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); router.dispose(); container.remove(); vi.unstubAllGlobals(); });
it("activates tabs with the keyboard and renders the selected note in its labelled panel", async () => {
  expect(container.textContent).toContain("Body of Alpha");
  const tab = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!;
  await act(async () => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(router.state.location.pathname).toBe("/explorer/Beta");
  expect(container.textContent).toContain("Body of Beta");
  const selected = container.querySelector('[role="tab"][aria-selected="true"]')!;
  expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.getAttribute("aria-labelledby")).toBe(selected.id);
  expect(document.activeElement).toBe(selected);
});
it("keeps the closed mobile drawer inert and restores trigger focus on Escape", async () => {
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Toggle note tree"]')!;
  const nav = container.querySelector('[aria-label="Notes"]')!;
  expect(nav.closest("[inert]")).not.toBeNull();
  await act(async () => toggle.click());
  expect(nav.closest("[inert]")).toBeNull();
  expect(container.querySelector('[aria-label="Explorer workspace"]')?.hasAttribute("inert")).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(nav.closest("[inert]")).not.toBeNull();
  expect(document.activeElement).toBe(toggle);
});
