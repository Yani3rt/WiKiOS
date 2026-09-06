// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Component } from "../src/client/routes/explorer-route";
import { AppearanceProvider } from "../src/client/appearance-provider";
import { readWorkspacePreferences, writeWorkspacePreferences } from "../src/client/workspace-preferences";
import { EXPLORER_STORAGE_KEY, serializeExplorerWorkspace } from "../src/client/explorer-model";

let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
let vaultId: string;
const pages = ["Alpha", "Beta"].map(title => ({ title, slug: title, file: `${title}.md`, modifiedAt: 1, firstSeenAt: 2 }));
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
    if (input === "/api/setup/status") return new Response(JSON.stringify({wikiRoot:"/vault",hasEnvOverride:false,recentVaults:[]}), {headers:{"content-type":"application/json"}});
    if (input.startsWith("/api/connections/")) return new Response(JSON.stringify({outgoing:[], incoming:[]}), {headers:{"content-type":"application/json"}});
    const title = input.split("/").at(-1)!;
    return new Response(JSON.stringify({
      slug: title, title, fileName: `${title}.md`, contentMarkdown: `Body of ${title}`,
      headings: [], hasCodeBlocks: false, modifiedAt: 1, categories: [], neighbors: [],
      isPerson: false, personOverride: null,
    }), { headers: { "content-type": "application/json" } });
  });
  vaultId = "test-vault";
  localStorage.clear();
  localStorage.setItem(`${EXPLORER_STORAGE_KEY}:test-vault`, serializeExplorerWorkspace({tabs: pages, activeSlug:"Alpha"}));
  router = createMemoryRouter([{ path: "/explorer/*", loader: () => ({pages, vaultId}), HydrateFallback: () => null, Component }], { initialEntries: ["/explorer/Alpha"] });
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

it("pins a note and opens Activity without discarding its tabs", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Pin note"]')!.click());
  expect(container.querySelector(".workspace-pins")?.textContent).toContain("Alpha");
  await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>(".workspace-nav button")).find(button => button.textContent === "Activity")!.click());
  expect(container.querySelector('[aria-label="Activity"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label="Open notes"] [role="tab"]')).toHaveLength(2);
  await act(async () => container.querySelector<HTMLButtonElement>('.activity-note[data-slug="Beta"]')!.click());
  expect(router.state.location.pathname).toBe("/explorer/Beta");
  expect(container.querySelector(".workspace-activity")).toBeNull();
});
it("restores reading position when switching back to a note", async () => {
  const scroll = vi.fn(function(this: HTMLElement, options?: ScrollToOptions | number, y?: number) {this.scrollTop = typeof options === "number" ? y ?? 0 : options?.top ?? 0;});
  HTMLElement.prototype.scrollTo = scroll;
  const panel = container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
  panel.scrollTop = 420;
  await act(async () => panel.dispatchEvent(new Event("scroll", {bubbles:true})));
  await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Open notes"] [role="tab"]')).find(button => button.textContent === "Beta")!.click());
  await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Open notes"] [role="tab"]')).find(button => button.textContent === "Alpha")!.click());
  expect(container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!.scrollTop).toBe(420);
});

it("returns from Activity to the reader on URL and history navigation", async () => {
  const openActivity = async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle note tree"]')!.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>(".workspace-nav button")).find(button => button.textContent === "Activity")!.click());
    expect(container.querySelector(".workspace-activity")).not.toBeNull();
  };
  await openActivity();
  await act(async () => router.navigate("/explorer/Beta"));
  expect(container.querySelector(".workspace-activity")).toBeNull();
  expect(container.querySelector(".workspace-reading-column")?.hasAttribute("hidden")).toBe(false);
  expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain("Body of Beta");
  await openActivity();
  await act(async () => router.navigate(-1));
  expect(container.querySelector(".workspace-activity")).toBeNull();
  expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain("Body of Alpha");
});

it("contains keyboard focus in mobile connections and restores its trigger on Escape", async () => {
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Toggle connections"]')!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle.click());
  const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Note connections"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector(".workspace-reading-column")?.hasAttribute("inert")).toBe(true);
  const close = dialog.querySelector<HTMLButtonElement>('[aria-label="Close connections"]')!;
  const last = dialog.querySelector<HTMLAnchorElement>(".workspace-graph-link")!;
  expect(document.activeElement).toBe(close);
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", shiftKey:true, bubbles:true})));
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", bubbles:true})));
  expect(document.activeElement).toBe(close);
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true})));
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector('[role="dialog"][aria-label="Note connections"]')).toBeNull();
  expect(container.querySelector(".workspace-reading-column")?.hasAttribute("inert")).toBe(false);
  expect(document.activeElement).toBe(toggle);
});

it("keeps persisted tabs and pins independent when the active vault changes", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Pin note"]')!.click());
  const originalTabs = localStorage.getItem(`${EXPLORER_STORAGE_KEY}:test-vault`);
  localStorage.setItem(`${EXPLORER_STORAGE_KEY}:other-vault`, serializeExplorerWorkspace({tabs:[pages[1]],activeSlug:"Beta"}));
  writeWorkspacePreferences("other-vault", {...readWorkspacePreferences("other-vault"), pinnedSlugs:["Beta"]});
  vaultId = "other-vault";
  await act(async () => router.navigate("/explorer"));
  expect(router.state.location.pathname).toBe("/explorer/Beta");
  expect(container.querySelectorAll('[aria-label="Open notes"] [role="tab"]')).toHaveLength(1);
  expect(container.querySelector(".workspace-pins")?.textContent).toContain("Beta");
  expect(container.querySelector(".workspace-pins")?.textContent).not.toContain("Alpha");
  expect(localStorage.getItem(`${EXPLORER_STORAGE_KEY}:test-vault`)).toBe(originalTabs);
  expect(readWorkspacePreferences("test-vault").pinnedSlugs).toEqual(["Alpha"]);
  vaultId = "test-vault";
  await act(async () => router.navigate("/explorer"));
  expect(router.state.location.pathname).toBe("/explorer/Alpha");
  expect(container.querySelectorAll('[aria-label="Open notes"] [role="tab"]')).toHaveLength(2);
  expect(container.querySelector(".workspace-pins")?.textContent).toContain("Alpha");
  expect(readWorkspacePreferences("other-vault").pinnedSlugs).toEqual(["Beta"]);
});

it("preserves scrolled positions across preference changes, history navigation and pagehide", async () => {
  HTMLElement.prototype.scrollTo = function(options?: ScrollToOptions | number, y?: number) { this.scrollTop = typeof options === "number" ? y ?? 0 : options?.top ?? 0; };
  const panel = container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
  panel.scrollTop = 560;
  await act(async () => panel.dispatchEvent(new Event("scroll", {bubbles:true})));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Pin note"]')!.click());
  await act(async () => router.navigate("/explorer/Beta"));
  await act(async () => router.navigate(-1));
  expect(container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!.scrollTop).toBe(560);
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(readWorkspacePreferences(vaultId).scrollPositions.Alpha).toBe(560);
});

it("links vault controls to change mode and labels search as a palette action", () => {
  expect(container.querySelector<HTMLAnchorElement>('[aria-label="Vault settings"]')?.getAttribute("href")).toBe("/setup?change=1");
  expect(container.querySelector('button[aria-label="Switch vault"]')?.getAttribute("aria-haspopup")).toBe("dialog");
  expect(container.querySelector('button[aria-label="Open search palette"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Open search palette"]')?.getAttribute("aria-haspopup")).toBe("dialog");
});

it("toggles focus mode without changing saved layout and restores focus on Escape", async () => {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Enter focus mode"]')!;
  expect(button).not.toBeNull();
  const before = readWorkspacePreferences(vaultId).connectionsOpen;
  await act(async () => button.click());
  expect(container.querySelector('main')?.classList.contains('workspace-focused')).toBe(true);
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})));
  expect(container.querySelector('main')?.classList.contains('workspace-focused')).toBe(false);
  expect(readWorkspacePreferences(vaultId).connectionsOpen).toBe(before);
  expect(document.activeElement).toBe(button);
});
it("does not offer Find in note on phones", () => {
  expect(container.querySelector('[aria-label="Find in note"]')).toBeNull();
});
it("offers Find at tablet width and removes it when resizing to phone width", async () => {
  const listeners = new Map<string, () => void>();
  let tablet = true;
  vi.stubGlobal('matchMedia', (query: string) => ({get matches() {return tablet && query === '(min-width: 768px)';}, addEventListener(_name: string, listener: () => void) {listeners.set(query, listener);}, removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="tablet" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  expect(container.querySelector('[aria-label="Find in note"]')).not.toBeNull();
  await act(async () => {tablet = false; listeners.get('(min-width: 768px)')!();});
  expect(container.querySelector('[aria-label="Find in note"]')).toBeNull();
  const event = new KeyboardEvent('keydown', {key:'f',ctrlKey:true,cancelable:true,bubbles:true});
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
