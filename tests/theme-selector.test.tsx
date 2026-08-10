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

import { AppearanceProvider } from "../src/client/appearance-provider";
import {
  createThemeSelectorDismissHandlers,
  ModeOptions,
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
  const options = ThemeOptions({ selectedTheme, resolvedMode: "light", onSelect });
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
      createElement(AppearanceProvider, {
        initialColorTheme: "teal",
        initialModePreference: "system",
        initialResolvedMode: "light",
      }, createElement(ThemeSelector)),
    );
    expect(markup).toContain('aria-label="Choose appearance"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Mode"');
    expect(markup).toContain('aria-label="Color"');
    expect(markup).toContain("System");
    expect(markup).toContain("Light");
    expect(markup).toContain("Dark");
    expect(markup).not.toContain("Choose the appearance");
  });

  it("renders all themes as a labeled radio group with explicit selected state", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeOptions, {
        selectedTheme: "blue",
        resolvedMode: "dark",
        onSelect: vi.fn(),
      }),
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("Teal");
    expect(markup).toContain("Blue");
    expect(markup).toContain("Violet");
    expect(markup).toMatch(/<input(?=[^>]*value="blue")(?=[^>]*checked)[^>]*>/);
    expect(markup).toContain("Selected");
    expect(markup).toContain("#111b2a");
    expect(markup).toContain("#7eb5ef");
    expect(markup).toContain("#192333");
  });

  it("renders a visible non-color cue only for the selected appearance mode", () => {
    const markup = renderToStaticMarkup(
      createElement(ModeOptions, { selectedMode: "system", onSelect: vi.fn() }),
    );

    expect(markup).toMatch(
      /<input(?=[^>]*name="wikios-theme-mode")(?=[^>]*value="system")(?=[^>]*checked)/u,
    );

    const options = ModeOptions({ selectedMode: "dark", onSelect: vi.fn() });
    const modes = childElements(options).map((label) => {
      const children = childElements(label);
      const radio = children.find((child) => child.type === "input");
      const state = children.find((child) => child.props.className === "theme-mode-option-state");
      if (!radio) throw new Error("Mode option is missing its radio input");
      if (!state) throw new Error("Mode option is missing its reserved state slot");
      return [
        radio.props.value,
        radio.props.checked,
        childElements(state).length === 1,
      ];
    });

    expect(modes).toEqual([
      ["system", false, false],
      ["light", false, false],
      ["dark", true, true],
    ]);

    const css = readFileSync(new URL("../src/client/globals.css", import.meta.url), "utf8");
    const stateRule = css.match(/\.theme-mode-option-state\s*\{([^}]*)\}/)?.[1];
    expect(stateRule).toContain("width: 1rem");
    expect(stateRule).not.toContain("position: absolute");
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

  it("keeps the selector open while choosing appearance options", async () => {
    let state: "closed" | "open" | "closing" = "closed";
    let selectedTheme: "teal" | "blue" | "violet" = "teal";
    let selectedMode: "system" | "light" | "dark" = "system";
    const setState = vi.fn(
      (
        next:
          | "closed"
          | "open"
          | "closing"
          | ((current: "closed" | "open" | "closing") => "closed" | "open" | "closing"),
      ) => {
        state = typeof next === "function" ? next(state) : next;
      },
    );
    const selectColorTheme = vi.fn((theme: "teal" | "blue" | "violet") => {
      selectedTheme = theme;
    });
    const selectModePreference = vi.fn((mode: "system" | "light" | "dark") => {
      selectedMode = mode;
    });

    vi.resetModules();
    vi.doMock("react", async (importOriginal) => {
      const actual = await importOriginal<typeof import("react")>();
      return {
        ...actual,
        useEffect: () => undefined,
        useId: () => "theme-popover",
        useRef: <T,>(initialValue: T) => ({ current: initialValue }),
        useState: () => [state, setState],
      };
    });
    vi.doMock("@/client/appearance-provider", () => ({
      useAppearance: () => ({
        colorTheme: selectedTheme,
        modePreference: selectedMode,
        resolvedMode: selectedMode === "system" ? "light" : selectedMode,
        selectColorTheme,
        selectModePreference,
      }),
    }));

    try {
      const {
        ModeOptions: StatefulModeOptions,
        ThemeOptions: StatefulThemeOptions,
        ThemeSelector: StatefulThemeSelector,
      } = await import("../src/components/theme-selector");

      const findTrigger = (children: ReturnType<typeof childElements>) =>
        children.find((child) => child.type === "button");
      const findPopover = (children: ReturnType<typeof childElements>) =>
        children.find((child) => child.props.role === "dialog");

      const closedSelector = StatefulThemeSelector();
      const closedChildren = childElements(closedSelector);
      const closedTrigger = findTrigger(closedChildren);
      const closedPopover = findPopover(closedChildren);
      if (!closedTrigger || !closedPopover) throw new Error("Closed theme selector is incomplete");
      expect(closedTrigger.props["aria-expanded"]).toBe(false);
      expect(closedPopover.props.className).toContain("t-dropdown");
      expect(closedPopover.props.className).not.toContain("is-open");
      expect(closedPopover.props.inert).toBe(true);
      (closedTrigger.props.onClick as () => void)();

      const openSelector = StatefulThemeSelector();
      const openChildren = childElements(openSelector);
      const openTrigger = findTrigger(openChildren);
      const popover = findPopover(openChildren);
      if (!openTrigger || !popover) throw new Error("Open theme selector is incomplete");
      expect(openTrigger.props["aria-expanded"]).toBe(true);
      expect(popover.props.className).toContain("is-open");
      expect(popover.props.inert).toBe(false);

      const modeOptionsElement = childElements(popover)
        .flatMap(childElements)
        .find((child) => child.type === StatefulModeOptions);
      if (!modeOptionsElement) throw new Error("Mode options are missing");
      const modeOptions = StatefulModeOptions(
        modeOptionsElement.props as Parameters<typeof StatefulModeOptions>[0],
      );
      const darkRadio = childElements(modeOptions)
        .flatMap(childElements)
        .find((child) => child.type === "input" && child.props.value === "dark");
      if (!darkRadio) throw new Error("Dark radio is missing");
      (darkRadio.props.onChange as () => void)();

      const optionsElement = childElements(popover)
        .flatMap(childElements)
        .find((child) => child.type === StatefulThemeOptions);
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
      const triggerAfterSelection = findTrigger(childrenAfterSelection);
      const popoverAfterSelection = findPopover(childrenAfterSelection);
      if (!triggerAfterSelection || !popoverAfterSelection) {
        throw new Error("Selected theme selector is incomplete");
      }

      expect(selectModePreference).toHaveBeenCalledExactlyOnceWith("dark");
      expect(selectColorTheme).toHaveBeenCalledExactlyOnceWith("violet");
      expect(triggerAfterSelection.props["aria-expanded"]).toBe(true);
      expect(popoverAfterSelection.props.className).toContain("is-open");
      expect(popoverAfterSelection.props.inert).toBe(false);
    } finally {
      vi.doUnmock("react");
      vi.doUnmock("@/client/appearance-provider");
      vi.resetModules();
    }
  });
});
