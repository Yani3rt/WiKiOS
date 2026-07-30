import { redirect, useLoaderData, useOutletContext } from "react-router-dom";

import type { AppShellOutletContext } from "@/client/app-shell";
import {
  normalizeCommandPalettePages,
  resolveCommandPalettePages,
} from "@/client/command-palette-model";
import { readRecentNoteSlugs } from "@/client/recent-note-storage";
import { HomepageContent } from "@/components/homepage-content";
import { SearchBox } from "@/components/search-box";
import type { ExplorerPage, HomepageData } from "@/lib/wiki-shared";

import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

export interface HomeRouteData {
  homepage: HomepageData;
  recentlyVisitedPages: ExplorerPage[];
}

export async function loadRecentlyVisitedPages(
  recentSlugs: readonly string[],
  loadExplorer: () => Promise<ExplorerPage[]> = () =>
    fetchJson<ExplorerPage[]>("/api/explorer"),
): Promise<ExplorerPage[]> {
  if (recentSlugs.length === 0) return [];

  try {
    const pages = normalizeCommandPalettePages(await loadExplorer());
    return resolveCommandPalettePages(pages, recentSlugs, "");
  } catch {
    return [];
  }
}

export async function loader(): Promise<HomeRouteData> {
  try {
    const homepage = await fetchJson<HomepageData>("/api/home");
    const recentlyVisitedPages = await loadRecentlyVisitedPages(
      readRecentNoteSlugs(),
    );
    return { homepage, recentlyVisitedPages };
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const { homepage, recentlyVisitedPages } = useLoaderData() as HomeRouteData;
  const { openCommandPalette } = useOutletContext<AppShellOutletContext>();

  return (
    <SearchBox
      totalPages={homepage.totalPages}
      onQuickSearch={openCommandPalette}
    >
      <HomepageContent
        homepage={homepage}
        recentlyVisitedPages={recentlyVisitedPages}
      />
    </SearchBox>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
