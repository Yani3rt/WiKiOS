import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { fetchJson } from "@/client/api";
import { initializeBrowserColorTheme } from "@/client/color-theme";
import { ColorThemeProvider } from "@/client/color-theme-provider";
import { WikiConfigProvider, applyThemeVariables } from "@/client/wiki-config";
import { DEFAULT_WIKI_OS_CONFIG, type WikiOsConfig } from "@/lib/wiki-config";

import "./globals.css";
import { router } from "./router";

const container = document.getElementById("root");

if (!(container instanceof HTMLElement)) {
  throw new Error("Root container not found");
}

const rootContainer: HTMLElement = container;
const initialColorTheme = initializeBrowserColorTheme();

async function bootstrap() {
  const config = await fetchJson<WikiOsConfig>("/api/config").catch(() => DEFAULT_WIKI_OS_CONFIG);

  applyThemeVariables(config);
  document.title = config.siteTitle;

  createRoot(rootContainer).render(
    <StrictMode>
      <WikiConfigProvider config={config}>
        <ColorThemeProvider initialTheme={initialColorTheme}>
          <RouterProvider router={router} />
        </ColorThemeProvider>
      </WikiConfigProvider>
    </StrictMode>,
  );
}

void bootstrap();
