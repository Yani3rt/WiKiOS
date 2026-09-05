// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppearanceProvider, useAppearance } from "../src/client/appearance-provider";
import { ThemeSelector } from "../src/components/theme-selector";

let root: Root;
let container: HTMLDivElement;
let media: EventTarget & { matches: boolean };
function Probe() {
  const value = useAppearance();
  return <output>{value.colorTheme}:{value.modePreference}:{value.resolvedMode}</output>;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(
    <AppearanceProvider initialColorTheme="teal" initialModePreference="system" initialResolvedMode="light">
      <ThemeSelector /><Probe />
    </AppearanceProvider>,
  ));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(selector: string) {
  const element = container.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => element!.click());
}
async function systemDark(matches: boolean) {
  media.matches = matches;
  await act(async () => media.dispatchEvent(Object.assign(new Event("change"), { matches })));
}
it("applies and persists color/mode selections through the rendered selector", async () => {
  await click("button"); await click('input[value="dark"]'); await click('input[value="violet"]');
  expect(container.querySelector("output")?.textContent).toBe("violet:dark:dark");
  expect(document.documentElement.dataset.mode).toBe("dark");
  expect(document.documentElement.dataset.colorTheme).toBe("violet");
  expect(localStorage.getItem("wikios:theme-mode")).toBe("dark");
  expect(localStorage.getItem("wikios:color-theme")).toBe("violet");
  expect(container.querySelector<HTMLInputElement>('input[value="dark"]')?.checked).toBe(true);
});
it("follows system changes only while System is selected", async () => {
  await systemDark(true);
  expect(container.querySelector("output")?.textContent).toBe("teal:system:dark");
  await click("button"); await click('input[value="light"]');
  await systemDark(false); await systemDark(true);
  expect(container.querySelector("output")?.textContent).toBe("teal:light:light");
  await click('input[value="system"]');
  expect(container.querySelector("output")?.textContent).toBe("teal:system:dark");
});
it("closes on Escape and returns focus to its trigger", async () => {
  await click("button"); container.querySelector<HTMLInputElement>("input")!.focus();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector('[role="dialog"]')?.hasAttribute("inert")).toBe(true);
  expect(document.activeElement).toBe(container.querySelector("button"));
});
it("dismisses on an outside pointer event but not an inside one", async () => {
  await click("button");
  await act(async () => container.querySelector("input")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
  await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
});
