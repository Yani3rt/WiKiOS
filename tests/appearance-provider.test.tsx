import { readFileSync } from "node:fs";
import { createElement, type DependencyList, type EffectCallback, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider, useAppearance } from "../src/client/appearance-provider";

function Probe() {
  const value = useAppearance();
  return createElement("span", {
    "data-color": value.colorTheme,
    "data-preference": value.modePreference,
    "data-resolved": value.resolvedMode,
  });
}

describe("appearance provider", () => {
  afterEach(() => {
    vi.doUnmock("react");
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("provides initialized color, preference, and resolved mode", () => {
    const markup = renderToStaticMarkup(createElement(AppearanceProvider, {
      initialColorTheme: "violet",
      initialModePreference: "system",
      initialResolvedMode: "dark",
    }, createElement(Probe)));
    expect(markup).toContain('data-color="violet"');
    expect(markup).toContain('data-preference="system"');
    expect(markup).toContain('data-resolved="dark"');
  });

  it("initializes both root axes before config overrides and rendering", () => {
    const main = readFileSync(new URL("../src/client/main.tsx", import.meta.url), "utf8");
    const colorInit = main.indexOf("initializeBrowserColorTheme()");
    const modeInit = main.indexOf("initializeBrowserThemeMode()");
    const config = main.indexOf("applyThemeVariables(config)");
    const render = main.indexOf("createRoot(rootContainer).render");
    expect(colorInit).toBeGreaterThan(-1);
    expect(modeInit).toBeGreaterThan(-1);
    expect(Math.max(colorInit, modeInit)).toBeLessThan(config);
    expect(config).toBeLessThan(render);
  });

  it("applies explicit modes, follows System changes, and unsubscribes when leaving System", async () => {
    const states: unknown[] = [];
    const effects: Array<{
      cleanup?: void | (() => void);
      dependencies?: DependencyList;
    }> = [];
    let stateCursor = 0;
    let effectCursor = 0;

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useCallback: <T,>(callback: T) => callback,
        useMemo: <T,>(factory: () => T) => factory(),
        useState: <T,>(initialValue: T) => {
          const index = stateCursor++;
          if (index === states.length) states.push(initialValue);
          return [states[index] as T, (value: T) => { states[index] = value; }] as const;
        },
        useEffect: (effect: EffectCallback, dependencies?: DependencyList) => {
          const index = effectCursor++;
          const previous = effects[index];
          const changed = !previous || !dependencies || !previous.dependencies
            || dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previous.dependencies?.[dependencyIndex]));
          if (!changed) return;
          previous?.cleanup?.();
          effects[index] = { cleanup: effect(), dependencies };
        },
      };
    });

    const root = { setAttribute: vi.fn() };
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
        mediaListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", { localStorage: storage, matchMedia: vi.fn(() => media) });

    const { AppearanceProvider: HookAppearanceProvider } = await import("../src/client/appearance-provider");
    const renderProvider = () => {
      stateCursor = 0;
      effectCursor = 0;
      return HookAppearanceProvider({
        initialColorTheme: "teal",
        initialModePreference: "system",
        initialResolvedMode: "light",
      }) as ReactElement<{ value: { selectModePreference(preference: "system" | "light" | "dark"): void } }>;
    };

    const provider = renderProvider();
    mediaListener?.({ matches: true } as MediaQueryListEvent);
    expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "dark");

    provider.props.value.selectModePreference("light");
    expect(root.setAttribute).toHaveBeenCalledWith("data-mode", "light");
    expect(storage.setItem).toHaveBeenCalledWith("wikios:theme-mode", "light");

    renderProvider();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", mediaListener);
  });
});
