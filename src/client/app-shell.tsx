import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { CommandPalette, type CommandPaletteStatus } from "@/components/command-palette";
import type { ExplorerPage, WikiActivity } from "@/lib/wiki-shared";

import { fetchJson } from "./api";
import {
  commandPaletteExplorerPath,
  isCommandPaletteShortcut,
  normalizeCommandPalettePages,
} from "./command-palette-model";
import { readWorkspacePreferences } from "./workspace-preferences";

export interface AppShellOutletContext {
  readonly openCommandPalette: () => void;
}

export function AppShell() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pages, setPages] = useState<ExplorerPage[]>([]);
  const [status, setStatus] = useState<CommandPaletteStatus>("idle");
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const openCommandPalette = useCallback(() => setPaletteOpen(true), []);

  const loadPages = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");

    try {
      const activity = await fetchJson<WikiActivity>("/api/activity", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPages(normalizeCommandPalettePages(activity.pages));
      setRecentSlugs(readWorkspacePreferences(activity.vaultId).recentSlugs);
      setStatus("ready");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }, []);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      openCommandPalette();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCommandPalette]);

  useEffect(() => {
    if (!paletteOpen) return;
    void loadPages();
  }, [loadPages, paletteOpen]);

  const selectPage = (page: ExplorerPage) => {
    setPaletteOpen(false);
    navigate(commandPaletteExplorerPath(page.slug));
  };

  return (
    <>
      <Outlet context={{ openCommandPalette }} />
      <CommandPalette
        open={paletteOpen}
        pages={pages}
        recentSlugs={recentSlugs}
        status={status}
        onClose={() => setPaletteOpen(false)}
        onRetry={() => void loadPages()}
        onSelect={selectPage}
      />
    </>
  );
}
