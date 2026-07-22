import { Check, Palette } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useColorTheme } from "@/client/color-theme-provider";
import { COLOR_THEMES, type ColorThemeId } from "@/client/color-theme";

interface ThemeSelectorDismissOptions {
  containsTarget(target: EventTarget | null): boolean;
  close(): void;
  focusTrigger(): void;
}

/** Shared event logic for the selector's document-level dismissal listeners. */
export function createThemeSelectorDismissHandlers({
  containsTarget,
  close,
  focusTrigger,
}: ThemeSelectorDismissOptions) {
  return {
    onPointerDown(event: Pick<PointerEvent, "target">) {
      if (!containsTarget(event.target)) close();
    },
    onKeyDown(event: Pick<KeyboardEvent, "key" | "preventDefault">) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      focusTrigger();
    },
  };
}

export function ThemeOptions({
  selectedTheme,
  onSelect,
}: {
  selectedTheme: ColorThemeId;
  onSelect(theme: ColorThemeId): void;
}) {
  return (
    <div role="radiogroup" aria-label="Color theme" className="theme-options">
      {COLOR_THEMES.map((theme) => {
        const selected = theme.id === selectedTheme;
        return (
          <label key={theme.id} className="theme-option">
            <input
              className="sr-only"
              type="radio"
              name="wikios-color-theme"
              value={theme.id}
              checked={selected}
              onChange={() => onSelect(theme.id)}
            />
            <span className="theme-option-swatches" aria-hidden="true">
              {theme.preview.map((color) => (
                <span key={color} style={{ backgroundColor: color }} />
              ))}
            </span>
            <span className="theme-option-label">{theme.label}</span>
            <span className="theme-option-state">
              {selected ? (
                <>
                  <Check aria-hidden className="h-4 w-4" />
                  <span>Selected</span>
                </>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

type ThemeSelectorState = "closed" | "open" | "closing";

/** Reads --dropdown-close-dur from the document so the unmount delay tracks the CSS token. */
function readDropdownCloseDurationMs(fallback = 150): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--dropdown-close-dur")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ThemeSelector() {
  const { colorTheme, selectColorTheme } = useColorTheme();
  const [state, setState] = useState<ThemeSelectorState>("closed");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const open = state === "open";

  // Hold .is-closing for the exit duration, then return to the closed base state.
  useEffect(() => {
    if (state !== "closing") return;
    const timer = window.setTimeout(
      () => setState("closed"),
      readDropdownCloseDurationMs(),
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!open) return;

    const { onPointerDown, onKeyDown } = createThemeSelectorDismissHandlers({
      containsTarget: (target) =>
        target instanceof Node && Boolean(wrapperRef.current?.contains(target)),
      close: () => setState("closing"),
      focusTrigger: () => triggerRef.current?.focus(),
    });

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSelect = (theme: ColorThemeId) => {
    selectColorTheme(theme);
    setState("closing");
    triggerRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="theme-selector">
      <button
        ref={triggerRef}
        type="button"
        className="app-route-header-control theme-selector-trigger"
        aria-label="Choose color theme"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setState((current) => (current === "open" ? "closing" : "open"))}
      >
        <Palette aria-hidden className="h-4 w-4" />
      </button>
      <div
        id={popoverId}
        role="dialog"
        aria-label="Choose color theme"
        inert={!open}
        data-origin="top-right"
        className={`theme-selector-popover t-dropdown${
          state === "open" ? " is-open" : state === "closing" ? " is-closing" : ""
        }`}
      >
        <p className="theme-selector-title">Color theme</p>
        <ThemeOptions selectedTheme={colorTheme} onSelect={handleSelect} />
      </div>
    </div>
  );
}
