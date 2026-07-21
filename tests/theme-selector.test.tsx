import { readFileSync } from "node:fs";

import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ColorThemeProvider } from "../src/client/color-theme-provider";
import {
  createThemeSelectorDismissHandlers,
  ThemeOptions,
  ThemeSelector,
} from "../src/components/theme-selector";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).filter(
    (child): child is ReactElement<Record<string, unknown>> =>
      isValidElement<Record<string, unknown>>(child),
  );
}

function childElements(element: ReactElement<unknown>) {
  return elements((element.props as { children?: ReactNode }).children);
}

function themeOptionRadios(selectedTheme: "teal" | "blue" | "violet", onSelect = vi.fn()) {
  const options = ThemeOptions({ selectedTheme, onSelect });
  return childElements(options).map((label) => {
    const radio = childElements(label).find((child) => child.type === "input");
    if (!radio) throw new Error("Theme option is missing its radio input");
    return radio;
  });
}

describe("ThemeSelector", () => {
  it("keeps the compact trigger at least 44 pixels wide", () => {
    const css = readFileSync(new URL("../src/client/globals.css", import.meta.url), "utf8");
    const triggerRule = css.match(/\.theme-selector-trigger\s*\{([^}]*)\}/)?.[1];

    expect(triggerRule).toContain("min-width: 2.75rem");
  });

  it("renders a named trigger with popup state", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorThemeProvider, { initialTheme: "teal" }, createElement(ThemeSelector)),
    );
    expect(markup).toContain('aria-label="Choose color theme"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("renders all themes as a labeled radio group with explicit selected state", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeOptions, { selectedTheme: "blue", onSelect: vi.fn() }),
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("Teal");
    expect(markup).toContain("Blue");
    expect(markup).toContain("Violet");
    expect(markup).toMatch(/<input(?=[^>]*value="blue")(?=[^>]*checked)[^>]*>/);
    expect(markup).toContain("Selected");
  });

  it("closes for an outside pointer press but not an inside press", () => {
    const insideTarget = {} as EventTarget;
    const close = vi.fn();
    const handlers = createThemeSelectorDismissHandlers({
      containsTarget: (target) => target === insideTarget,
      close,
      focusTrigger: vi.fn(),
    });

    handlers.onPointerDown({ target: insideTarget });
    expect(close).not.toHaveBeenCalled();

    handlers.onPointerDown({ target: {} as EventTarget });
    expect(close).toHaveBeenCalledOnce();
  });

  it("handles Escape and ignores other keys", () => {
    const close = vi.fn();
    const focusTrigger = vi.fn();
    const preventDefault = vi.fn();
    const handlers = createThemeSelectorDismissHandlers({
      containsTarget: vi.fn(() => false),
      close,
      focusTrigger,
    });

    handlers.onKeyDown({ key: "Enter", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(focusTrigger).not.toHaveBeenCalled();

    handlers.onKeyDown({ key: "Escape", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(focusTrigger).toHaveBeenCalledOnce();
  });

  it("uses exactly three same-name radios with the chosen option selected", () => {
    const radios = themeOptionRadios("blue");

    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.props.name)).toEqual([
      "wikios-color-theme",
      "wikios-color-theme",
      "wikios-color-theme",
    ]);
    expect(radios.map((radio) => [radio.props.value, radio.props.checked])).toEqual([
      ["teal", false],
      ["blue", true],
      ["violet", false],
    ]);
  });

  it("keeps the open selector mounted after choosing another theme", async () => {
    let open = false;
    let selectedTheme: "teal" | "blue" | "violet" = "teal";
    const setOpen = vi.fn((next: boolean | ((current: boolean) => boolean)) => {
      open = typeof next === "function" ? next(open) : next;
    });
    const selectColorTheme = vi.fn((theme: "teal" | "blue" | "violet") => {
      selectedTheme = theme;
    });

    vi.resetModules();
    vi.doMock("react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react")>();
      return {
        ...actual,
        useEffect: () => undefined,
        useId: () => "theme-popover",
        useRef: <T,>(initialValue: T) => ({ current: initialValue }),
        useState: () => [open, setOpen],
      };
    });
    vi.doMock("@/client/color-theme-provider", () => ({
      useColorTheme: () => ({ colorTheme: selectedTheme, selectColorTheme }),
    }));

    try {
      const {
        ThemeOptions: StatefulThemeOptions,
        ThemeSelector: StatefulThemeSelector,
      } = await import("../src/components/theme-selector");

      const closedSelector = StatefulThemeSelector();
      const closedTrigger = childElements(closedSelector).find(
        (child) => child.type === "button",
      );
      if (!closedTrigger) throw new Error("Theme trigger is missing");
      (closedTrigger.props.onClick as () => void)();

      const openSelector = StatefulThemeSelector();
      const openChildren = childElements(openSelector);
      const openTrigger = openChildren.find((child) => child.type === "button");
      const popover = openChildren.find((child) => child.props.role === "dialog");
      if (!openTrigger || !popover) throw new Error("Open theme selector is incomplete");
      expect(openTrigger.props["aria-expanded"]).toBe(true);

      const optionsElement = childElements(popover).find(
        (child) => child.type === StatefulThemeOptions,
      );
      if (!optionsElement) throw new Error("Theme options are missing");
      const options = StatefulThemeOptions(
        optionsElement.props as Parameters<typeof StatefulThemeOptions>[0],
      );
      const violetRadio = childElements(options)
        .flatMap(childElements)
        .find((child) => child.type === "input" && child.props.value === "violet");
      if (!violetRadio) throw new Error("Violet radio is missing");
      (violetRadio.props.onChange as () => void)();

      const selectorAfterSelection = StatefulThemeSelector();
      const childrenAfterSelection = childElements(selectorAfterSelection);
      const triggerAfterSelection = childrenAfterSelection.find(
        (child) => child.type === "button",
      );
      const popoverAfterSelection = childrenAfterSelection.find(
        (child) => child.props.role === "dialog",
      );
      const optionsAfterSelection = popoverAfterSelection
        ? childElements(popoverAfterSelection).find(
            (child) => child.type === StatefulThemeOptions,
          )
        : undefined;

      expect(selectColorTheme).toHaveBeenCalledExactlyOnceWith("violet");
      expect(triggerAfterSelection?.props["aria-expanded"]).toBe(true);
      expect(popoverAfterSelection).toBeDefined();
      expect(optionsAfterSelection?.props.selectedTheme).toBe("violet");
    } finally {
      vi.doUnmock("react");
      vi.doUnmock("@/client/color-theme-provider");
      vi.resetModules();
    }
  });
});
