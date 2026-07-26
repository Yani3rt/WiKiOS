import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { CommandPalette, type CommandPaletteStatus } from "@/components/command-palette";
import type { ExplorerPage } from "@/lib/wiki-shared";

import { fetchJson } from "./api";
import {
  commandPaletteExplorerPath,
  isCommandPaletteShortcut,
  normalizeCommandPalettePages,
  noteSlugFromPathname,
  promoteRecentNote,
} from "./command-palette-model";
import {
  persistRecentNoteSlugs,
  readRecentNoteSlugs,
} from "./recent-note-storage";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pages, setPages] = useState<ExplorerPage[]>([]);
  const [status, setStatus] = useState<CommandPaletteStatus>("idle");
  const [recentSlugs, setRecentSlugs] = useState<string[]>(readRecentNoteSlugs);
  const requestRef = useRef<AbortController | null>(null);

  const loadPages = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");

    try {
      const loadedPages = await fetchJson<ExplorerPage[]>("/api/explorer", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPages(normalizeCommandPalettePages(loadedPages));
      setStatus("ready");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }, []);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    const slug = noteSlugFromPathname(location.pathname);
    if (!slug) return;

    setRecentSlugs((current) => {
      const next = promoteRecentNote(current, slug);
      if (next.length === current.length && next.every((item, index) => item === current[index])) {
        return current;
      }
      persistRecentNoteSlugs(next);
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      setPaletteOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen || status !== "idle") return;
    void loadPages();
  }, [loadPages, paletteOpen, status]);

  const selectPage = (page: ExplorerPage) => {
    setPaletteOpen(false);
    navigate(commandPaletteExplorerPath(page.slug));
  };

  return (
    <>
      <Outlet />
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
