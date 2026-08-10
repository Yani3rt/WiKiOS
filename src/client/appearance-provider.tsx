import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyColorTheme,
  browserThemeStorage,
  persistColorTheme,
  type ColorThemeId,
} from "./color-theme";
import {
  applyResolvedThemeMode,
  browserColorSchemeMediaQuery,
  persistThemeModePreference,
  resolveThemeMode,
  subscribeToSystemTheme,
  type ResolvedThemeMode,
  type ThemeModePreference,
} from "./theme-mode";

export interface AppearanceContextValue {
  colorTheme: ColorThemeId;
  modePreference: ThemeModePreference;
  resolvedMode: ResolvedThemeMode;
  selectColorTheme(theme: ColorThemeId): void;
  selectModePreference(preference: ThemeModePreference): void;
}

const ResolvedModeContext = createContext<ResolvedThemeMode>("light");
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({
  children,
  initialColorTheme,
  initialModePreference,
  initialResolvedMode,
}: {
  children?: ReactNode;
  initialColorTheme: ColorThemeId;
  initialModePreference: ThemeModePreference;
  initialResolvedMode: ResolvedThemeMode;
}) {
  const [colorTheme, setColorTheme] = useState(initialColorTheme);
  const [modePreference, setModePreference] = useState(initialModePreference);
  const [resolvedMode, setResolvedMode] = useState(initialResolvedMode);

  const selectColorTheme = useCallback((theme: ColorThemeId) => {
    applyColorTheme(document.documentElement, theme);
    persistColorTheme(browserThemeStorage(), theme);
    setColorTheme(theme);
  }, []);

  const selectModePreference = useCallback((preference: ThemeModePreference) => {
    const media = browserColorSchemeMediaQuery();
    const nextResolvedMode = resolveThemeMode(preference, media);
    applyResolvedThemeMode(document.documentElement, nextResolvedMode);
    persistThemeModePreference(browserThemeStorage(), preference);
    setModePreference(preference);
    setResolvedMode(nextResolvedMode);
  }, []);

  useEffect(() => {
    if (modePreference !== "system") return;
    const media = browserColorSchemeMediaQuery();
    return subscribeToSystemTheme(media, (event) => {
      const nextResolvedMode: ResolvedThemeMode = event.matches ? "dark" : "light";
      applyResolvedThemeMode(document.documentElement, nextResolvedMode);
      setResolvedMode(nextResolvedMode);
    });
  }, [modePreference]);

  const value = useMemo(() => ({
    colorTheme,
    modePreference,
    resolvedMode,
    selectColorTheme,
    selectModePreference,
  }), [colorTheme, modePreference, resolvedMode, selectColorTheme, selectModePreference]);

  return (
    <AppearanceContext.Provider value={value}>
      <ResolvedModeContext.Provider value={resolvedMode}>
        {children}
      </ResolvedModeContext.Provider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider");
  return value;
}

export function useResolvedThemeMode() {
  return useContext(ResolvedModeContext);
}
