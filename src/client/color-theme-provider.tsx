import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  applyColorTheme,
  browserThemeStorage,
  persistColorTheme,
  type ColorThemeId,
} from "./color-theme";

interface ColorThemeContextValue {
  colorTheme: ColorThemeId;
  selectColorTheme(theme: ColorThemeId): void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

export function ColorThemeProvider({
  children,
  initialTheme,
}: {
  children?: ReactNode;
  initialTheme: ColorThemeId;
}) {
  const [colorTheme, setColorTheme] = useState(initialTheme);
  const selectColorTheme = useCallback((theme: ColorThemeId) => {
    applyColorTheme(document.documentElement, theme);
    persistColorTheme(browserThemeStorage(), theme);
    setColorTheme(theme);
  }, []);
  const value = useMemo(() => ({ colorTheme, selectColorTheme }), [colorTheme, selectColorTheme]);
  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme() {
  const value = useContext(ColorThemeContext);
  if (!value) throw new Error("useColorTheme must be used inside ColorThemeProvider");
  return value;
}
