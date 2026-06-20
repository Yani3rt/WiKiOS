import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  House,
  PanelLeft,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  redirect,
  useLoaderData,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Link } from "react-router-dom";
import { NoteViewer } from "@/components/note-viewer";
import type { ExplorerPage, WikiPageData } from "@/lib/wiki-shared";

import { fetchJson, isSetupRequiredResponse } from "../api";
import {
  EMPTY_EXPLORER_WORKSPACE,
  EXPLORER_STORAGE_KEY,
  activateExplorerTab,
  buildExplorerTree,
  closeExplorerTab,
  closeOtherExplorerTabs,
  collectFolderPaths,
  filterExplorerPages,
  flattenVisibleTree,
  openExplorerTab,
  parseExplorerWorkspace,
  serializeExplorerWorkspace,
  type ExplorerTab,
  type ExplorerWorkspace,
} from "../explorer-model";
import { RouteErrorBoundary } from "../route-error-boundary";

type ReaderState =
  | { slug: null; status: "idle" }
  | { slug: string; status: "loading" }
  | { slug: string; status: "ready"; page: WikiPageData }
  | { slug: string; status: "missing" }
  | { slug: string; status: "error" };

export function selectExplorerReaderState(
  activeSlug: string | null,
  state: ReaderState,
): ReaderState {
  if (!activeSlug) return { slug: null, status: "idle" };
  return state.slug === activeSlug ? state : { slug: activeSlug, status: "loading" };
}

export function normalizeExplorerSlug(rawSplat: string | undefined) {
  return (rawSplat ?? "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function encodeExplorerSlug(slug: string, rounds: number) {
  return slug
    .split("/")
    .filter(Boolean)
    .map((part) => {
      let encoded = part;
      for (let index = 0; index < rounds; index += 1) {
        encoded = encodeURIComponent(encoded);
      }
      return encoded;
    })
    .join("/");
}

export function encodeExplorerRouteSlug(slug: string) {
  return encodeExplorerSlug(slug, 1);
}

export function encodeExplorerApiSlug(slug: string) {
  return encodeExplorerSlug(slug, 2);
}

function canonicalExplorerSlugFromFile(file: string) {
  return file
    .replace(/\.md$/iu, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

export function normalizeExplorerPages(pages: ExplorerPage[]) {
  return pages.map((page) => ({
    ...page,
    slug: canonicalExplorerSlugFromFile(page.file),
  }));
}

export function normalizeExplorerWorkspaceSlugs(
  workspace: ExplorerWorkspace,
): ExplorerWorkspace {
  const tabs: ExplorerTab[] = [];
  const seenSlugs = new Set<string>();
  let activeSlug: string | null = null;

  for (const tab of workspace.tabs) {
    const slug = canonicalExplorerSlugFromFile(tab.file);
    if (tab.slug === workspace.activeSlug) activeSlug = slug;
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    tabs.push({ slug, title: tab.title, file: tab.file });
  }

  if (tabs.length === 0) return { tabs: [], activeSlug: null };
  return {
    tabs,
    activeSlug: activeSlug && seenSlugs.has(activeSlug) ? activeSlug : tabs[0].slug,
  };
}

function explorerPath(slug: string | null) {
  return slug ? `/explorer/${encodeExplorerRouteSlug(slug)}` : "/explorer";
}

function fallbackTab(slug: string): ExplorerTab {
  const finalSegment = slug.split("/").at(-1) || slug;
  return { slug, title: finalSegment, file: `${slug}.md` };
}

export function shouldNavigateExplorerTransition(
  current: ExplorerWorkspace,
  next: ExplorerWorkspace,
  routeSlug: string | null,
) {
  return current.activeSlug !== next.activeSlug || next.activeSlug !== routeSlug;
}

export function getNextExplorerTabIndex(
  key: string,
  currentIndex: number,
  tabCount: number,
) {
  if (tabCount <= 0) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  return null;
}

function explorerTabId(slug: string) {
  return `explorer-tab-${encodeURIComponent(slug)}`;
}

function explorerPanelId(slug: string) {
  return `explorer-panel-${encodeURIComponent(slug)}`;
}

export async function loadPage(slug: string, signal?: AbortSignal) {
  return fetchJson<WikiPageData>(`/api/wiki/${encodeExplorerApiSlug(slug)}`, { signal });
}

export function applyExplorerRefreshResult(
  activeSlug: string | null,
  requestSlug: string,
  page: WikiPageData,
): ReaderState | null {
  if (activeSlug !== requestSlug) return null;
  return { slug: requestSlug, status: "ready", page };
}

function folderAncestorsForSlug(slug: string | null) {
  if (!slug) return [];

  const segments = slug.split("/").filter(Boolean);
  const paths: string[] = [];
  let current = "";
  for (const segment of segments.slice(0, -1)) {
    current = current ? `${current}/${segment}` : segment;
    paths.push(current);
  }
  return paths;
}

function initialExpandedPaths(tree: ReturnType<typeof buildExplorerTree>, activeSlug: string | null) {
  const activeAncestors = folderAncestorsForSlug(activeSlug);
  if (activeAncestors.length > 0) return new Set(activeAncestors);
  return new Set(tree.folders.map((folder) => folder.path));
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}

function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function isExplorerSidebarInteractive(sidebarOpen: boolean, isDesktop: boolean) {
  return sidebarOpen || isDesktop;
}

export function isExplorerModalActive(sidebarOpen: boolean, isDesktop: boolean) {
  return sidebarOpen && !isDesktop;
}

interface ExplorerStorageReader {
  getItem(key: string): string | null;
}

interface ExplorerStorageWriter {
  setItem(key: string, value: string): void;
}

export function readExplorerWorkspaceStorage(
  storage: ExplorerStorageReader,
): ExplorerWorkspace {
  try {
    const stored = storage.getItem(EXPLORER_STORAGE_KEY);
    return stored
      ? normalizeExplorerWorkspaceSlugs(parseExplorerWorkspace(stored))
      : EMPTY_EXPLORER_WORKSPACE;
  } catch {
    return EMPTY_EXPLORER_WORKSPACE;
  }
}

export function writeExplorerWorkspaceStorage(
  storage: ExplorerStorageWriter,
  workspace: ExplorerWorkspace,
) {
  try {
    storage.setItem(EXPLORER_STORAGE_KEY, serializeExplorerWorkspace(workspace));
    return true;
  } catch {
    return false;
  }
}

function readStoredWorkspace(): ExplorerWorkspace {
  if (typeof window === "undefined") return EMPTY_EXPLORER_WORKSPACE;
  try {
    return readExplorerWorkspaceStorage(window.localStorage);
  } catch {
    return EMPTY_EXPLORER_WORKSPACE;
  }
}

export async function loader() {
  try {
    return await fetchJson<ExplorerPage[]>("/api/explorer");
  } catch (error) {
    if (isSetupRequiredResponse(error)) throw redirect("/setup");
    throw error;
  }
}

export function ExplorerHeader({
  sidebarOpen,
  onToggleSidebar,
  toggleButtonRef,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  toggleButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4 md:px-5">
      <Link
        to="/"
        className="rounded-md px-1 py-1 text-left transition-colors hover:text-[var(--teal)]"
      >
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">WikiOS</p>
        <div className="mt-0.5 flex items-center gap-2">
          <House className="h-4 w-4 text-[var(--muted-foreground)]" />
          <h1 className="font-display text-lg">Note Explorer</h1>
        </div>
      </Link>
      <button
        ref={toggleButtonRef}
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm md:hidden"
        aria-expanded={sidebarOpen}
        aria-controls="explorer-sidebar"
        aria-label="Toggle note tree"
        onClick={onToggleSidebar}
      >
        <PanelLeft className="h-4 w-4" />
        Notes
      </button>
    </header>
  );
}

export function ExplorerSidebar({
  pages,
  activeSlug,
  onSelect,
  filterInputRef,
}: {
  pages: ExplorerPage[];
  activeSlug: string | null;
  onSelect: (page: ExplorerPage) => void;
  filterInputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const filteredPages = useMemo(() => filterExplorerPages(pages, query), [pages, query]);
  const tree = useMemo(() => buildExplorerTree(filteredPages), [filteredPages]);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => initialExpandedPaths(tree, activeSlug),
  );
  const allFolderPaths = useMemo(() => collectFolderPaths(tree), [tree]);
  const rows = useMemo(
    () => flattenVisibleTree(tree, expandedPaths),
    [expandedPaths, tree],
  );
  const visibleCount = filteredPages.length;
  const hasFilter = query.trim().length > 0;

  useEffect(() => {
    const availablePaths = new Set(allFolderPaths);
    const preferred =
      hasFilter
        ? new Set(allFolderPaths)
        : initialExpandedPaths(tree, activeSlug);

    setExpandedPaths((current) => {
      const next = new Set<string>();
      for (const path of current) {
        if (availablePaths.has(path)) next.add(path);
      }
      for (const path of preferred) next.add(path);
      return sameSet(current, next) ? current : next;
    });
  }, [activeSlug, allFolderPaths, hasFilter, tree]);

  const toggleFolder = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav aria-label="Notes" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            ref={filterInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter titles or paths"
            aria-label="Filter notes"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-10 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear note filter"
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p
            className="text-xs text-[var(--muted-foreground)]"
            role="status"
            aria-live="polite"
          >
            {visibleCount} {visibleCount === 1 ? "note" : "notes"}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Expand all folders"
              className="rounded-full px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => setExpandedPaths(new Set(collectFolderPaths(tree)))}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Collapse all folders"
              className="rounded-full px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => setExpandedPaths(new Set())}
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div className="explorer-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
            {hasFilter ? "No notes match this filter yet." : "No notes are available in this view."}
          </div>
        ) : (
          rows.map((row) =>
            row.kind === "folder" ? (
              <button
                key={`folder:${row.path}`}
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
                style={{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }}
                aria-expanded={expandedPaths.has(row.path)}
                onClick={() => toggleFolder(row.path)}
              >
                {expandedPaths.has(row.path) ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                )}
                <span className="truncate">{row.name}</span>
                <span className="ml-auto text-xs text-[var(--muted-foreground)]">{row.count}</span>
              </button>
            ) : (
              <button
                key={row.page.slug}
                type="button"
                className={`w-full rounded-xl px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)] ${
                  activeSlug === row.page.slug
                    ? "bg-[var(--accent)] font-medium text-[var(--foreground)] shadow-[inset_0_0_0_1px_rgba(196,167,231,0.35)]"
                    : "text-[var(--foreground)]"
                }`}
                style={{ paddingLeft: `${1.75 + row.depth * 0.875}rem` }}
                aria-current={activeSlug === row.page.slug ? "page" : undefined}
                onClick={() => onSelect(row.page)}
              >
                <div className="truncate">{row.page.title}</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">{row.page.slug}</div>
              </button>
            ),
          )
        )}
      </div>
    </nav>
  );
}

export function ExplorerTabs({
  workspace,
  fallbackFocusRef,
  onActivate,
  onClose,
  onCloseOthers,
}: {
  workspace: ExplorerWorkspace;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onActivate: (slug: string) => void;
  onClose: (slug: string) => void;
  onCloseOthers: (slug: string) => void;
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousTabCount = useRef(workspace.tabs.length);

  useEffect(() => {
    const removedTabs = workspace.tabs.length < previousTabCount.current;
    previousTabCount.current = workspace.tabs.length;
    if (!removedTabs) return;

    const frame = requestAnimationFrame(() => {
      if (workspace.activeSlug) {
        tabRefs.current.get(workspace.activeSlug)?.focus();
      } else {
        fallbackFocusRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fallbackFocusRef, workspace.activeSlug, workspace.tabs.length]);

  if (workspace.tabs.length === 0) return null;

  return (
    <div
      className="explorer-scrollbar flex min-h-11 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)]/80"
      role="tablist"
      aria-label="Open notes"
    >
      {workspace.tabs.map((tab, index) => {
        const active = tab.slug === workspace.activeSlug;
        const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
          const nextIndex = getNextExplorerTabIndex(
            event.key,
            index,
            workspace.tabs.length,
          );
          if (nextIndex === null) return;

          event.preventDefault();
          const nextTab = workspace.tabs[nextIndex];
          document.getElementById(explorerTabId(nextTab.slug))?.focus();
          onActivate(nextTab.slug);
        };

        return (
          <div key={tab.slug} className="flex shrink-0 items-center border-r border-[var(--border)]">
            <button
              type="button"
              role="tab"
              id={explorerTabId(tab.slug)}
              aria-controls={explorerPanelId(tab.slug)}
              aria-selected={active}
              tabIndex={active || (!workspace.activeSlug && index === 0) ? 0 : -1}
              ref={(element) => {
                if (element) tabRefs.current.set(tab.slug, element);
                else tabRefs.current.delete(tab.slug);
              }}
              className={`h-full max-w-52 truncate px-3 text-sm ${active ? "bg-[var(--background)] font-medium" : "bg-[var(--muted)]"}`}
              onClick={() => onActivate(tab.slug)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.title}
            </button>
            {active && workspace.tabs.length > 1 ? (
              <button
                type="button"
                className="px-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label={`Close other notes except ${tab.title}`}
                title="Close other tabs"
                onClick={() => onCloseOthers(tab.slug)}
              >
                ◫
              </button>
            ) : null}
            <button
              type="button"
              className="px-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.slug)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ExplorerEmptyState({ hasTabs }: { hasTabs: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <h2 className="font-display text-xl">{hasTabs ? "No note selected" : "Open a note"}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {hasTabs ? "Choose an open tab to continue reading." : "Select a note from the sidebar to begin."}
        </p>
      </div>
    </div>
  );
}

export function ExplorerReader({
  state,
  hasTabs,
  onWikiLink,
  onRefreshPage,
  workspaceScrollRef,
}: {
  state: ReaderState;
  hasTabs: boolean;
  onWikiLink: (slug: string) => void;
  onRefreshPage: () => Promise<void>;
  workspaceScrollRef: RefObject<HTMLElement | null>;
}) {
  if (state.status === "idle") return <ExplorerEmptyState hasTabs={hasTabs} />;
  if (state.status === "loading") return <p className="p-8 text-sm text-[var(--muted-foreground)]">Loading note…</p>;
  if (state.status === "missing") return <p className="p-8">This note could not be found.</p>;
  if (state.status === "error") return <p className="p-8">The note could not be loaded. Please try again.</p>;

  const { page } = state;
  return (
    <div
      className="animate-in mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
    >
      <NoteViewer
        page={page}
        onNavigateNote={onWikiLink}
        onRefreshPage={onRefreshPage}
        scrollContainerRef={workspaceScrollRef}
      />
    </div>
  );
}

export function Component() {
  const loadedPages = useLoaderData() as ExplorerPage[];
  const pages = useMemo(() => normalizeExplorerPages(loadedPages), [loadedPages]);
  const params = useParams();
  const navigate = useNavigate();
  const urlSlug = normalizeExplorerSlug(params["*"]);
  const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages]);
  const [workspace, setWorkspace] = useState<ExplorerWorkspace>(readStoredWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readerState, setReaderState] = useState<ReaderState>({ slug: null, status: "idle" });
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const workspaceStateRef = useRef(workspace);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const sidebarCloseFocusTargetRef = useRef<"toggle" | "workspace">("toggle");
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDesktopSidebar = useMediaQuery("(min-width: 768px)");
  const sidebarInteractive = isExplorerSidebarInteractive(sidebarOpen, isDesktopSidebar);
  const sidebarModalActive = isExplorerModalActive(sidebarOpen, isDesktopSidebar);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    workspaceStateRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        sidebarCloseFocusTargetRef.current = "toggle";
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (sidebarInteractive) {
      sidebarRef.current?.removeAttribute("inert");
      return;
    }

    const focusWasInsideDrawer = sidebarRef.current?.contains(document.activeElement) ?? false;
    sidebarRef.current?.setAttribute("inert", "");
    if (focusWasInsideDrawer) toggleButtonRef.current?.focus();
  }, [sidebarInteractive]);

  useEffect(() => {
    if (sidebarModalActive) {
      workspaceRef.current?.setAttribute("inert", "");
      filterInputRef.current?.focus();
      return;
    }

    workspaceRef.current?.removeAttribute("inert");
    if (sidebarCloseFocusTargetRef.current === "workspace") {
      workspaceRef.current?.focus();
      sidebarCloseFocusTargetRef.current = "toggle";
    }
  }, [sidebarModalActive]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      writeExplorerWorkspaceStorage(window.localStorage, workspace);
    } catch {
      // Storage access can be unavailable in restricted browser contexts.
    }
  }, [hydrated, workspace]);

  useEffect(() => {
    setWorkspace((current) => {
      if (!urlSlug) {
        return current.activeSlug === null ? current : { tabs: [...current.tabs], activeSlug: null };
      }
      return openExplorerTab(current, pageBySlug.get(urlSlug) ?? fallbackTab(urlSlug));
    });
  }, [pageBySlug, urlSlug]);

  useEffect(() => {
    const slug = workspace.activeSlug;
    if (!slug) {
      setReaderState({ slug: null, status: "idle" });
      return;
    }

    const controller = new AbortController();
    setReaderState({ slug, status: "loading" });
    loadPage(slug, controller.signal)
      .then((page) => {
        const nextState = applyExplorerRefreshResult(
          workspaceStateRef.current.activeSlug,
          slug,
          page,
        );
        if (nextState) setReaderState(nextState);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isSetupRequiredResponse(error)) {
          navigate("/setup");
          return;
        }
        if (workspaceStateRef.current.activeSlug !== slug) return;
        setReaderState(
          error instanceof Response && error.status === 404
            ? { slug, status: "missing" }
            : { slug, status: "error" },
        );
      });
    return () => controller.abort();
  }, [navigate, workspace.activeSlug]);

  useEffect(() => {
    workspaceScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [workspace.activeSlug]);

  const refreshActivePage = useCallback(async () => {
    const slug = workspaceStateRef.current.activeSlug;
    if (!slug) return;

    try {
      const page = await loadPage(slug);
      const nextState = applyExplorerRefreshResult(
        workspaceStateRef.current.activeSlug,
        slug,
        page,
      );
      if (nextState) setReaderState(nextState);
    } catch (error) {
      if (isSetupRequiredResponse(error)) {
        navigate("/setup");
      }
      throw error;
    }
  }, [navigate]);

  const transitionAndNavigate = useCallback(
    (transition: (current: ExplorerWorkspace) => ExplorerWorkspace) => {
      const next = transition(workspace);
      setWorkspace(next);
      if (shouldNavigateExplorerTransition(workspace, next, urlSlug || null)) {
        navigate(explorerPath(next.activeSlug));
      }
    },
    [navigate, urlSlug, workspace],
  );

  const selectSlug = useCallback(
    (slug: string) => {
      sidebarCloseFocusTargetRef.current = "workspace";
      setSidebarOpen(false);
      transitionAndNavigate((current) =>
        openExplorerTab(current, pageBySlug.get(slug) ?? fallbackTab(slug)),
      );
    },
    [pageBySlug, transitionAndNavigate],
  );

  const selectPage = (page: ExplorerPage) => selectSlug(page.slug);
  const visibleReaderState = selectExplorerReaderState(
    workspace.activeSlug,
    readerState,
  );

  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <ExplorerHeader
        sidebarOpen={sidebarOpen}
        toggleButtonRef={toggleButtonRef}
        onToggleSidebar={() => {
          sidebarCloseFocusTargetRef.current = "toggle";
          setSidebarOpen((open) => !open);
        }}
      />
      <div className="flex min-h-0 flex-1">
        <div
          aria-hidden="true"
          className={`explorer-sidebar-backdrop fixed inset-0 z-30 md:hidden ${
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          } ${prefersReducedMotion ? "transition-none" : "transition-opacity duration-200"} motion-reduce:transition-none`}
          onClick={() => {
            sidebarCloseFocusTargetRef.current = "toggle";
            setSidebarOpen(false);
          }}
        />
        <aside
          ref={sidebarRef}
          id="explorer-sidebar"
          aria-hidden={!sidebarInteractive}
          aria-modal={sidebarModalActive}
          role="dialog"
          className={`fixed inset-y-16 left-0 z-40 w-[18.5rem] max-w-[calc(100vw-2rem)] border-r border-[var(--border)] bg-[var(--background)] shadow-[0_18px_48px_-24px_rgba(21,19,26,0.4)] md:static md:inset-auto md:z-auto md:w-[19rem] md:max-w-none md:translate-x-0 md:shadow-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
          } ${prefersReducedMotion ? "transition-none" : "transition-transform duration-200 ease-out"} motion-reduce:transition-none`}
        >
          <ExplorerSidebar
            pages={pages}
            activeSlug={workspace.activeSlug}
            onSelect={selectPage}
            filterInputRef={filterInputRef}
          />
        </aside>
        <section
          ref={workspaceRef}
          tabIndex={-1}
          aria-hidden={sidebarModalActive}
          className="flex min-w-0 flex-1 flex-col md:min-w-0"
          aria-label="Explorer workspace"
        >
          <ExplorerTabs
            workspace={workspace}
            fallbackFocusRef={workspaceRef}
            onActivate={(slug) => transitionAndNavigate((current) => activateExplorerTab(current, slug))}
            onClose={(slug) => transitionAndNavigate((current) => closeExplorerTab(current, slug))}
            onCloseOthers={(slug) => transitionAndNavigate((current) => closeOtherExplorerTabs(current, slug))}
          />
          {workspace.tabs.map((tab) => {
            const active = tab.slug === workspace.activeSlug;
            return (
              <div
                key={tab.slug}
                id={explorerPanelId(tab.slug)}
                role="tabpanel"
                aria-labelledby={explorerTabId(tab.slug)}
                tabIndex={active ? 0 : -1}
                hidden={!active}
                className="min-h-0 flex-1 overflow-y-auto"
                ref={active ? workspaceScrollRef : undefined}
              >
                {active ? (
                  <ExplorerReader
                    state={visibleReaderState}
                    hasTabs
                    onWikiLink={selectSlug}
                    onRefreshPage={refreshActivePage}
                    workspaceScrollRef={workspaceScrollRef}
                  />
                ) : null}
              </div>
            );
          })}
          {!workspace.activeSlug ? (
            <div
              ref={workspaceScrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <ExplorerReader
                state={visibleReaderState}
                hasTabs={workspace.tabs.length > 0}
                onWikiLink={selectSlug}
                onRefreshPage={refreshActivePage}
                workspaceScrollRef={workspaceScrollRef}
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
