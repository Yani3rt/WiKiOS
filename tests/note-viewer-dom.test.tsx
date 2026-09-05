// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NoteViewer } from "../src/components/note-viewer";
import { AppearanceProvider } from "../src/client/appearance-provider";
import { WikiConfigProvider } from "../src/client/wiki-config";
import { ThemeSelector } from "../src/components/theme-selector";
import { DEFAULT_WIKI_OS_CONFIG } from "../src/lib/wiki-config";
import type { WikiPageData } from "../src/lib/wiki-shared";

const parsing = vi.hoisted(() => ({ passes: 0 }));
vi.mock("rehype-highlight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rehype-highlight")>();
  return { default: (...args: Parameters<typeof actual.default>) => {
    const transform = actual.default(...args);
    return (...values: Parameters<typeof transform>) => { parsing.passes++; return transform(...values); };
  } };
});

// Mermaid is an external SVG engine; keep the actual React component and render queue.
vi.mock("mermaid", () => {
  let mode = false;
  return { default: {
    initialize: (config: { darkMode: boolean }) => { mode = config.darkMode; },
    render: async () => ({ svg: `<svg data-mode="${mode ? "dark" : "light"}"></svg>` }),
  } };
});
let root: Root;
let container: HTMLDivElement;
const page: WikiPageData = {
  slug: "Home", fileName: "Home.md", title: "Home", contentMarkdown: "",
  headings: [], hasCodeBlocks: true, modifiedAt: 1, categories: [], neighbors: [],
  isPerson: false, personOverride: null,
};
const navigate = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  navigate.mockClear(); localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); page.headings = []; });
async function render(markdown: string) {
  await act(async () => root.render(
    <MemoryRouter><WikiConfigProvider config={DEFAULT_WIKI_OS_CONFIG}>
      <AppearanceProvider initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light">
        <ThemeSelector /><NoteViewer page={{ ...page, contentMarkdown: markdown }} onNavigateNote={navigate} />
      </AppearanceProvider>
    </WikiConfigProvider></MemoryRouter>,
  ));
}
it("routes a rendered internal link without taking over modified clicks", async () => {
  await render("[Note](/wiki/Folder/Note)");
  const anchor = container.querySelector<HTMLAnchorElement>('article a')!;
  await act(async () => anchor.click());
  expect(navigate).toHaveBeenCalledWith("Folder/Note");
  navigate.mockClear();
  anchor.target = "_blank";
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  await act(async () => anchor.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});
it("copies raw fenced code through the rendered button", async () => {
  const copied: string[] = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  await render("```bash\necho hello\n```");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy code"]')!.click());
  expect(copied).toEqual(["echo hello\n"]);
  expect(container.textContent).toContain("Copied");
});
it("switches between normal code and Mermaid and rerenders diagrams after a theme change", async () => {
  await render("```bash\necho hello\n```");
  await render("```mermaid\ngraph TD; A-->B\n```");
  expect(container.querySelector("svg[data-mode]")?.getAttribute("data-mode")).toBe("light");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Choose appearance"]')!.click());
  await act(async () => container.querySelector<HTMLInputElement>('input[value="dark"]')!.click());
  expect(container.querySelector("svg[data-mode]")?.getAttribute("data-mode")).toBe("dark");
  await render("```bash\necho again\n```");
  expect(container.querySelector('[aria-label="Copy code"]')).not.toBeNull();
  expect(container.querySelector("svg[data-mode]")).toBeNull();
});

it("does not reparse a long note when only the reading position changes", async () => {
  vi.useFakeTimers();
  const content = Array.from({ length: 100 }, (_, i) => `## Section ${i}\n\nParagraph ${i}.\n\n`).join("");
  const headings = Array.from({ length: 100 }, (_, i) => ({ id: `section-${i}`, text: `Section ${i}`, level: 2 }));
  page.headings = headings;
  await render(content);
  await act(async () => vi.advanceTimersByTime(150));
  const before = parsing.passes;
  const elements = [...container.querySelectorAll<HTMLElement>("article h2")];
  let offset = 0;
  for (const [index, element] of elements.entries()) {
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({ top: index * 200 - offset }) as DOMRect);
  }
  for (let index = 1; index <= 5; index++) {
    offset = index * 200;
    await act(async () => { window.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20); });
  }
  expect(container.querySelector('a[href="#section-5"][aria-current="location"]')).not.toBeNull();
  expect(parsing.passes - before).toBe(0);
  page.headings = [];
  vi.useRealTimers();
});
