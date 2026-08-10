import type { ResolvedThemeMode } from "./theme-mode";

export interface MermaidThemeColors {
  background: string;
  primary: string;
  primaryText: string;
  primaryBorder: string;
  line: string;
  secondary: string;
  tertiary: string;
}

const tokenNames = {
  background: "--mermaid-background",
  primary: "--mermaid-primary",
  primaryText: "--mermaid-primary-text",
  primaryBorder: "--mermaid-primary-border",
  line: "--mermaid-line",
  secondary: "--mermaid-secondary",
  tertiary: "--mermaid-tertiary",
} as const;

export function readMermaidThemeColors(element: Element): MermaidThemeColors {
  const styles = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(tokenNames).map(([key, token]) => [key, styles.getPropertyValue(token).trim()]),
  ) as unknown as MermaidThemeColors;
}

export function getMermaidConfig(mode: ResolvedThemeMode, colors: MermaidThemeColors) {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    darkMode: mode === "dark",
    themeVariables: {
      background: colors.background,
      primaryColor: colors.primary,
      primaryTextColor: colors.primaryText,
      primaryBorderColor: colors.primaryBorder,
      lineColor: colors.line,
      secondaryColor: colors.secondary,
      tertiaryColor: colors.tertiary,
    },
  };
}

let renderQueue: Promise<void> = Promise.resolve();

export function renderMermaidDiagram(
  code: string,
  id: string,
  mode: ResolvedThemeMode,
  colors: MermaidThemeColors,
) {
  const task = renderQueue.then(async () => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize(getMermaidConfig(mode, colors));
    return mermaid.render(`note-mermaid-${id}`, code);
  });
  renderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
