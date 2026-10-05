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
  HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
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
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Notes: toggle note tree"]')!;
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
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Notes: toggle note tree"]')!.click());
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
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="More note actions"]')!;
  await act(async () => toggle.click());
  await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("dialog[open] > button")).find(button => button.textContent === "Connections")!.click());
  const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Note connections"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("aria-modal")).toBe("true");

  expect(container.querySelector(".workspace-reading-column")?.hasAttribute("inert")).toBe(true);
  const close = dialog.querySelector<HTMLButtonElement>('[aria-label="Close connections"]')!;
  const last = dialog.querySelector<HTMLAnchorElement>(".workspace-graph-link")!;
  expect(document.activeElement).toBe(close);
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", shiftKey:true, bubbles:true})));
  expect(document.activeElement).toBe(last);
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", {key:"Tab", bubbles:true})));
  expect(document.activeElement).toBe(close);
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true})));

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
  expect(container.querySelector('.workspace-brand-actions button[aria-label="Search"]')).not.toBeNull();
  expect(container.querySelector('.workspace-brand-actions button[aria-label="Search"]')?.getAttribute("aria-haspopup")).toBe("dialog");
});

it("toggles focus mode without changing saved layout and restores focus on Escape", async () => {
  const more = container.querySelector<HTMLButtonElement>('button[aria-label="More note actions"]')!;
  await act(async () => more.click());
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('dialog[open] > button')).find(button => button.textContent === 'Focus mode')!;
  const before = readWorkspacePreferences(vaultId).connectionsOpen;
  await act(async () => button.click());
  expect(document.activeElement).toBe(container.querySelector('.workspace-exit-focus'));
  expect(container.querySelector('main')?.classList.contains('workspace-focused')).toBe(true);
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})));
  expect(container.querySelector('main')?.classList.contains('workspace-focused')).toBe(false);
  expect(readWorkspacePreferences(vaultId).connectionsOpen).toBe(before);
  expect(document.activeElement).toBe(container.querySelector('button[aria-label="More note actions"]'));
});
it("does not offer Find in note on phones", () => {
  expect(container.querySelector('[aria-label="Find in note"]')).toBeNull();
  expect(container.querySelector('[role="separator"][aria-label="Resize navigation"]')).toBeNull();
});
it("offers Find at tablet width and removes it when resizing to phone width", async () => {
  const listeners = new Map<string, () => void>();
  let tablet = true;
  vi.stubGlobal('matchMedia', (query: string) => ({get matches() {return tablet && query === '(min-width: 768px)';}, addEventListener(_name: string, listener: () => void) {listeners.set(query, listener);}, removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="tablet" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  expect(container.querySelector('[aria-label="Find in note"]')).not.toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Collapse navigation"]')!.click());
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  await act(async () => {tablet = false; listeners.get('(min-width: 768px)')!();});
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  expect(container.querySelector('[aria-label="Mobile navigation"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Find in note"]')).toBeNull();
  const event = new KeyboardEvent('keydown', {key:'f',ctrlKey:true,cancelable:true,bubbles:true});
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Notes: toggle note tree"]')!.click());
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('false');
  await act(async () => {tablet = true; listeners.get('(min-width: 768px)')!();});
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('#explorer-sidebar')?.hasAttribute('inert')).toBe(true);
});

it('keeps the reader accessible from collapsed desktop navigation without expanding the tree', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const collapse = container.querySelector<HTMLButtonElement>('[aria-label="Collapse navigation"]')!;
  await act(async () => {collapse.focus();collapse.click();});
  const rail = container.querySelector<HTMLElement>('[aria-label="Mini sidebar"]')!;
  expect(rail).not.toBeNull();
  expect(container.querySelector('#explorer-sidebar')?.hasAttribute('inert')).toBe(true);
  expect(document.activeElement).toBe(rail.querySelector('[aria-label="Show note tree"]'));
  expect(rail.querySelector('[aria-label="Search"]')?.getAttribute('aria-haspopup')).toBe('dialog');
  expect(rail.querySelector('[aria-label="Graph"]')?.getAttribute('href')).toBe('/graph');
  const activity = rail.querySelector<HTMLButtonElement>('[aria-label="Activity"]')!;
  await act(async () => activity.click());
  expect(container.querySelector('.workspace-activity')).not.toBeNull();
  expect(activity.getAttribute('aria-current')).toBe('page');
  const notes = rail.querySelector<HTMLButtonElement>('[aria-label="Notes"]')!;
  await act(async () => notes.click());
  expect(notes.getAttribute('aria-current')).toBe('page');
  expect(container.querySelector('.workspace-activity')).toBeNull();
  expect(container.querySelector('.workspace-reading-column')?.hasAttribute('hidden')).toBe(false);
  expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain('Body of Alpha');
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('true');
  const appearance = rail.querySelector<HTMLButtonElement>('[aria-label="Choose appearance"]')!;
  await act(async () => appearance.click());
  expect(appearance.getAttribute('aria-expanded')).toBe('true');
  await act(async () => rail.querySelector<HTMLButtonElement>('[aria-label="Show note tree"]')!.click());
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  expect(container.querySelector('#explorer-sidebar')?.hasAttribute('inert')).toBe(false);
});

it('toggles between full and mini desktop navigation with Command-Shift-S', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const shortcut = () => new KeyboardEvent('keydown',{key:'S',metaKey:true,shiftKey:true,cancelable:true,bubbles:true});
  const collapse = shortcut();
  await act(async () => window.dispatchEvent(collapse));
  expect(collapse.defaultPrevented).toBe(true);
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{key:'S',metaKey:true,shiftKey:true,repeat:true})));
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  await act(async () => window.dispatchEvent(shortcut()));
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('false');
});

it('resizes desktop navigation by dragging without toggling and stops on pointer cancellation', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const divider = container.querySelector<HTMLElement>('[role="separator"][aria-label="Resize navigation"]')!;
  expect(divider).not.toBeNull();
  // jsdom has no pointer-capture implementation; the real component owns the drag state.
  divider.setPointerCapture = () => {};
  divider.hasPointerCapture = () => false;
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type,{clientX,button:0,bubbles:true,cancelable:true});
    Object.defineProperty(event,'pointerId',{value:1});
    return event;
  };
  await act(async () => divider.dispatchEvent(pointer('pointerdown',304)));
  await act(async () => divider.dispatchEvent(pointer('pointermove',390)));
  expect(divider.getAttribute('aria-valuenow')).toBe('390');
  await act(async () => divider.dispatchEvent(pointer('pointermove',304)));
  expect(divider.getAttribute('aria-valuenow')).toBe('304');
  await act(async () => divider.dispatchEvent(pointer('pointermove',390)));
  expect(container.querySelector('#explorer-sidebar')?.getAttribute('aria-hidden')).toBe('false');
  await act(async () => divider.dispatchEvent(pointer('pointerup',390)));
  await act(async () => divider.dispatchEvent(pointer('pointermove',460)));
  expect(readWorkspacePreferences(vaultId).sidebarWidth).toBe(390);
  await act(async () => divider.dispatchEvent(pointer('pointerdown',390)));
  await act(async () => divider.dispatchEvent(pointer('pointermove',400)));
  await act(async () => divider.dispatchEvent(pointer('pointercancel',400)));
  await act(async () => divider.dispatchEvent(pointer('pointermove',460)));
  expect(readWorkspacePreferences(vaultId).sidebarWidth).toBe(400);
  expect(document.body.style.cursor).not.toBe('col-resize');
  const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Toggle sidebar"]')!;
  await act(async () => toggle.click());
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  await act(async () => toggle.click());
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  expect(divider.getAttribute('aria-valuenow')).toBe('400');
});

it.each([288, 400])('snaps to mini below half the minimum width during a held drag from %ipx and ends the gesture', async initialWidth => {
  writeWorkspacePreferences(vaultId, {...readWorkspacePreferences(vaultId), sidebarWidth: initialWidth});
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const divider = container.querySelector<HTMLElement>('[role="separator"][aria-label="Resize navigation"]')!;
  let captured = false;
  // Model the browser's pointer capture; assert on the real rendered sidebar state.
  divider.setPointerCapture = () => { captured = true; };
  divider.hasPointerCapture = () => captured;
  divider.releasePointerCapture = () => { captured = false; };
  const pointer = async (type: string, clientX: number) => {
    const event = new MouseEvent(type, {clientX, button:0, bubbles:true, cancelable:true});
    Object.defineProperty(event, 'pointerId', {value:1});
    await act(async () => divider.dispatchEvent(event));
  };
  await pointer('pointerdown', initialWidth);
  await pointer('pointermove', 288);
  await pointer('pointermove', 180);
  expect(divider.getAttribute('aria-valuenow')).toBe('288');
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  await pointer('pointermove', 144);
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  await pointer('pointermove', 143);
  expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  expect(readWorkspacePreferences(vaultId).sidebarWidth).toBe(288);
  expect(captured).toBe(false);
  expect(document.body.style.cursor).not.toBe('col-resize');
  expect(document.body.style.userSelect).not.toBe('none');
  await pointer('pointermove', 400);
  await pointer('pointerup', 400);
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  await pointer('pointerdown', 56);
  await pointer('pointermove', 20);
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  await pointer('pointermove', 56);
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  await pointer('pointermove', 80);
  await pointer('pointermove', 90);
  expect(divider.getAttribute('aria-valuenow')).toBe('288');
  await pointer('pointermove', 400);
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  expect(divider.getAttribute('aria-valuenow')).toBe('400');
  await pointer('pointerup', 400);
  // A fast move can cross both the minimum and snap threshold in one event.
  await pointer('pointerdown', 400);
  await pointer('pointermove', 80);
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  expect(readWorkspacePreferences(vaultId).sidebarWidth).toBe(288);
  await act(async () => container.querySelector<HTMLButtonElement>('.workspace-mini-sidebar [aria-label="Show note tree"]')!.click());
  expect(divider.getAttribute('aria-valuenow')).toBe('288');
});

it('resizes with the keyboard within safe limits and restores the saved width after remounting', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const divider = container.querySelector<HTMLElement>('[role="separator"][aria-label="Resize navigation"]')!;
  expect(divider).not.toBeNull();
  const key = async (value: string) => act(async () => divider.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
  await key('ArrowRight');
  expect(divider.getAttribute('aria-valuenow')).toBe('324');
  await key('End');
  await key('ArrowRight');
  expect(divider.getAttribute('aria-valuenow')).toBe('480');
  await key('Home');
  await key('ArrowLeft');
  expect(divider.getAttribute('aria-valuenow')).toBe('288');
  await key('Enter');
  expect(divider.getAttribute('aria-valuenow')).toBe('56');
  await key('Enter');
  await key('ArrowRight');
  expect(divider.getAttribute('aria-valuenow')).toBe('308');
  await act(async () => root.render(<AppearanceProvider key="remount" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  expect(container.querySelector('[role="separator"]')?.getAttribute('aria-valuenow')).toBe('308');
  expect(readWorkspacePreferences('other-vault').sidebarWidth).toBe(304);
});
it('opens a tapped drawer note in its workspace tab without a preview on mobile', async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Notes: toggle note tree"]')!.click());
  const note = container.querySelector<HTMLButtonElement>('[data-note-slug="Beta"]')!;
  await act(async () => {note.focus();note.click();});
  expect(router.state.location.pathname).toBe('/explorer/Beta');
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Beta');
  expect(container.querySelector('[aria-label="Note preview"]')).toBeNull();
});

it('provides bottom navigation with direct Activity and Notes access', async () => {
  const nav = container.querySelector<HTMLElement>('[aria-label="Mobile navigation"]');
  expect(nav).not.toBeNull();
  expect(nav!.querySelector('a')?.getAttribute('href')).toBe('/graph');
  const activity = Array.from(nav!.querySelectorAll('button')).find(button => button.textContent === 'Activity')!;
  await act(async () => activity.click());
  expect(container.querySelector('.workspace-activity')).not.toBeNull();
  expect(activity.getAttribute('aria-current')).toBe('page');
  const notes = nav!.querySelector<HTMLButtonElement>('[aria-label="Notes: toggle note tree"]')!;
  await act(async () => notes.click());
  expect(notes.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.workspace-activity')).toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})));
  expect(document.activeElement).toBe(notes);
});

it('opens a mobile note actions sheet and pins the note', async () => {
  const more = container.querySelector<HTMLButtonElement>('button[aria-label="More note actions"]');
  expect(more).not.toBeNull();
  await act(async () => more!.click());
  const sheet = container.querySelector<HTMLDialogElement>('dialog[aria-label="Note actions"]')!;
  expect(sheet.hasAttribute('open')).toBe(true);
  const pin = Array.from(sheet.querySelectorAll('button')).find(button => button.textContent === 'Pin note')!;
  await act(async () => pin.click());
  expect(container.querySelector('.workspace-pins')?.textContent).toContain('Alpha');
  expect(sheet.hasAttribute('open')).toBe(false);
});

it('toolbar arrows follow open-tab order rather than browser history', async () => {
  await act(async () => router.navigate('/explorer/Gamma'));
  await act(async () => router.navigate('/explorer/Beta'));
  // New tabs open at the left: Gamma, Alpha, Beta. Browser Back would go to Gamma.
  const previous = container.querySelector<HTMLButtonElement>('[aria-label="Previous open note"]');
  const next = container.querySelector<HTMLButtonElement>('[aria-label="Next open note"]');
  expect(previous).not.toBeNull();
  expect(next!.disabled).toBe(true);
  await act(async () => previous!.click());
  expect(router.state.location.pathname).toBe('/explorer/Alpha');
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Alpha');
  expect(next!.disabled).toBe(false);
  await act(async () => previous!.click());
  expect(router.state.location.pathname).toBe('/explorer/Gamma');
  expect(previous!.disabled).toBe(true);
  await act(async () => next!.click());
  expect(router.state.location.pathname).toBe('/explorer/Alpha');
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
});

it('disables both open-note arrows when only one tab remains', async () => {
  const close = container.querySelector<HTMLButtonElement>('[aria-label="Close Beta"]');
  expect(close).not.toBeNull();
  await act(async () => close!.click());
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous open note"]')?.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next open note"]')?.disabled).toBe(true);
});

it('keeps the selected tab visible when navigating with mobile arrows', async () => {
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next open note"]')!.click());
  expect(scroll).toHaveBeenCalledWith({block:'nearest',inline:'nearest',behavior:'auto'});
  expect(scroll.mock.contexts.at(-1)).toBe(container.querySelector('[role="tab"][aria-selected="true"]'));
  scroll.mockRestore();
});

it("shows Activity after the last tab closes and preserves reading position", async () => {
  HTMLElement.prototype.scrollTo = function(options?: ScrollToOptions | number, y?: number) { this.scrollTop = typeof options === "number" ? y ?? 0 : options?.top ?? 0; };
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close Beta"]')!.click());
  const panel = container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
  Object.defineProperties(panel, {scrollHeight:{value:1500}, clientHeight:{value:500}});
  panel.scrollTop = 420;
  await act(async () => panel.dispatchEvent(new Event("scroll", {bubbles:true})));
  // A preference update must not replace the scroll-only reading history.
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Pin note"]')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close Alpha"]')!.click());
  expect(router.state.location.pathname).toBe("/explorer");
  expect(container.querySelector(".workspace-activity")).not.toBeNull();
  expect(container.querySelector(".workspace-start")).toBeNull();
  expect(container.querySelectorAll('[aria-label="Open notes"] [role="tab"]')).toHaveLength(0);
  const resume = container.querySelector<HTMLButtonElement>('.activity-note[data-slug="Alpha"]');
  expect(container.querySelector('[aria-label="Explorer workspace"]')?.hasAttribute("inert")).toBe(false);
  resume!.focus();
  await act(async () => resume!.click());
  expect(router.state.location.pathname).toBe("/explorer/Alpha");
  expect(container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!.scrollTop).toBe(420);
  expect(readWorkspacePreferences(vaultId).readingProgress.Alpha).toBe(42);
});

it.each([{recentSlugs:[]}, {recentSlugs:["missing", "Beta", "Alpha"]}])("shows Activity on a root visit with no tabs and history $recentSlugs", async ({recentSlugs}) => {
  vaultId = "returning-vault";
  writeWorkspacePreferences(vaultId, {...readWorkspacePreferences(vaultId), recentSlugs});
  await act(async () => router.navigate("/explorer"));
  expect(container.querySelector(".workspace-activity")).not.toBeNull();
  expect(container.querySelector(".workspace-start")).toBeNull();
  expect(container.querySelector('[aria-label="Explorer workspace"]')?.hasAttribute("inert")).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('.activity-note[data-slug="Alpha"]')!.click());
  expect(router.state.location.pathname).toBe("/explorer/Alpha");
  expect(container.querySelector(".workspace-activity")).toBeNull();
  expect(container.textContent).toContain("Body of Alpha");
});

it("keeps reading the remaining note when closing the active tab", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close Alpha"]')!.click());
  expect(router.state.location.pathname).toBe("/explorer/Beta");
  expect(container.querySelector(".workspace-activity")).toBeNull();
  expect(container.textContent).toContain("Body of Beta");
});


it('keeps the mini sidebar collapsed for shrinking keys and opens at the minimum for ArrowRight', async () => {
  writeWorkspacePreferences(vaultId, {...readWorkspacePreferences(vaultId), sidebarWidth:400});
  vi.stubGlobal('matchMedia', (query: string) => ({matches:query === '(min-width: 768px)',addEventListener() {},removeEventListener() {}}));
  await act(async () => root.render(<AppearanceProvider key="desktop" initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light"><RouterProvider router={router}/></AppearanceProvider>));
  const divider = container.querySelector<HTMLElement>('[role="separator"][aria-label="Resize navigation"]')!;
  const key = async (value: string) => act(async () => divider.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));
  await key('Enter');
  for (const value of ['ArrowLeft', 'Home', 'ArrowLeft']) {
    await key(value);
    expect(divider.getAttribute('aria-valuenow')).toBe('56');
    expect(container.querySelector('[aria-label="Mini sidebar"]')).not.toBeNull();
    expect(readWorkspacePreferences(vaultId).sidebarWidth).toBe(400);
  }
  await key('ArrowRight');
  expect(divider.getAttribute('aria-valuenow')).toBe('288');
  expect(container.querySelector('[aria-label="Mini sidebar"]')).toBeNull();
  await key('Enter');
  await key('End');
  expect(divider.getAttribute('aria-valuenow')).toBe('480');
});
