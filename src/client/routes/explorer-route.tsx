import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  redirect,
  useLoaderData,
  useNavigate,
  useParams,
} from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

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
  flattenVisibleTree,
  openExplorerTab,
  parseExplorerWorkspace,
  serializeExplorerWorkspace,
  type ExplorerTab,
  type ExplorerWorkspace,
} from "../explorer-model";
import { RouteErrorBoundary } from "../route-error-boundary";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];
const markdownBaseComponents: Components = {
  h1: (props) => <h1 className="mb-4 scroll-mt-20 text-3xl" {...props} />,
  h2: (props) => <h2 className="font-display mb-3 mt-10 scroll-mt-20 text-xl" {...props} />,
  h3: (props) => <h3 className="font-display mb-2 mt-7 scroll-mt-20 text-lg" {...props} />,
  p: (props) => <p className="mb-4 leading-[1.8]" {...props} />,
  ul: (props) => <ul className="mb-4 list-disc pl-6 leading-[1.8]" {...props} />,
  ol: (props) => <ol className="mb-4 list-decimal pl-6 leading-[1.8]" {...props} />,
};

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

export function encodeExplorerSlug(slug: string) {
  return slug
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
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
  return slug ? `/explorer/${encodeExplorerSlug(slug)}` : "/explorer";
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

function decodeMarkdownLinkSlug(encodedSlug: string) {
  return encodedSlug
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
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

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">WikiOS</p>
        <h1 className="font-display text-lg">Note Explorer</h1>
      </div>
      <button
        type="button"
        className="rounded border border-[var(--border)] px-3 py-1.5 text-sm md:hidden"
        aria-expanded={sidebarOpen}
        aria-controls="explorer-sidebar"
        onClick={onToggleSidebar}
      >
        {sidebarOpen ? "Hide notes" : "Show notes"}
      </button>
    </header>
  );
}

export function ExplorerSidebar({
  pages,
  activeSlug,
  onSelect,
}: {
  pages: ExplorerPage[];
  activeSlug: string | null;
  onSelect: (page: ExplorerPage) => void;
}) {
  const tree = useMemo(() => buildExplorerTree(pages), [pages]);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(collectFolderPaths(tree)),
  );
  const rows = useMemo(
    () => flattenVisibleTree(tree, expandedPaths),
    [expandedPaths, tree],
  );

  const toggleFolder = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <nav aria-label="Notes" className="h-full overflow-y-auto p-2">
      {rows.map((row) =>
        row.kind === "folder" ? (
          <button
            key={`folder:${row.path}`}
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
            style={{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }}
            aria-expanded={expandedPaths.has(row.path)}
            onClick={() => toggleFolder(row.path)}
          >
            <span aria-hidden="true">{expandedPaths.has(row.path) ? "▾" : "▸"}</span>
            <span className="truncate">{row.name}</span>
            <span className="ml-auto text-xs text-[var(--muted-foreground)]">{row.count}</span>
          </button>
        ) : (
          <button
            key={row.page.slug}
            type="button"
            className={`w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)] ${
              activeSlug === row.page.slug ? "bg-[var(--muted)] font-medium" : ""
            }`}
            style={{ paddingLeft: `${1.75 + row.depth * 0.875}rem` }}
            aria-current={activeSlug === row.page.slug ? "page" : undefined}
            onClick={() => onSelect(row.page)}
          >
            {row.page.title}
          </button>
        ),
      )}
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
    <div className="flex min-h-11 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Open notes">
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
                aria-label={`Close other tabs except ${tab.title}`}
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
}: {
  state: ReaderState;
  hasTabs: boolean;
  onWikiLink: (slug: string) => void;
}) {
  const markdownComponents = useMemo<Components>(
    () => ({
      ...markdownBaseComponents,
      a: ({ href, onClick, ...props }) => {
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          if (event.defaultPrevented || !href) return;
          const url = new URL(href, window.location.origin);
          if (url.origin === window.location.origin && url.pathname.startsWith("/wiki/")) {
            event.preventDefault();
            onWikiLink(
              decodeMarkdownLinkSlug(url.pathname.slice("/wiki/".length)),
            );
          }
        };
        return <a href={href} onClick={handleClick} {...props} />;
      },
    }),
    [onWikiLink],
  );

  if (state.status === "idle") return <ExplorerEmptyState hasTabs={hasTabs} />;
  if (state.status === "loading") return <p className="p-8 text-sm text-[var(--muted-foreground)]">Loading note…</p>;
  if (state.status === "missing") return <p className="p-8">This note could not be found.</p>;
  if (state.status === "error") return <p className="p-8">The note could not be loaded. Please try again.</p>;

  const { page } = state;
  return (
    <article className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10">
      <header className="mb-8 border-b border-[var(--border)] pb-6">
        <h2 className="font-display text-3xl">{page.title}</h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
          <span>{page.fileName}</span>
          <time dateTime={new Date(page.modifiedAt).toISOString()}>{formatDate(page.modifiedAt)}</time>
        </div>
        {page.categories.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Categories">
            {page.categories.map((category) => (
              <li key={category} className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs">{category}</li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="prose prose-neutral max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {page.contentMarkdown}
        </ReactMarkdown>
      </div>
    </article>
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
  const workspaceFocusRef = useRef<HTMLElement>(null);

  useEffect(() => setHydrated(true), []);

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
    fetchJson<WikiPageData>(`/api/wiki/${encodeExplorerSlug(slug)}`, { signal: controller.signal })
      .then((page) => setReaderState({ slug, status: "ready", page }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isSetupRequiredResponse(error)) {
          navigate("/setup");
          return;
        }
        setReaderState(
          error instanceof Response && error.status === 404
            ? { slug, status: "missing" }
            : { slug, status: "error" },
        );
      });
    return () => controller.abort();
  }, [navigate, workspace.activeSlug]);

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
      <ExplorerHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <div className="flex min-h-0 flex-1">
        <aside
          id="explorer-sidebar"
          className={`${sidebarOpen ? "block" : "hidden"} w-72 shrink-0 border-r border-[var(--border)] bg-[var(--background)] md:block`}
        >
          <ExplorerSidebar pages={pages} activeSlug={workspace.activeSlug} onSelect={selectPage} />
        </aside>
        <section
          ref={workspaceFocusRef}
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col"
          aria-label="Explorer workspace"
        >
          <ExplorerTabs
            workspace={workspace}
            fallbackFocusRef={workspaceFocusRef}
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
              >
                {active ? (
                  <ExplorerReader
                    state={visibleReaderState}
                    hasTabs
                    onWikiLink={selectSlug}
                  />
                ) : null}
              </div>
            );
          })}
          {!workspace.activeSlug ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ExplorerReader
                state={visibleReaderState}
                hasTabs={workspace.tabs.length > 0}
                onWikiLink={selectSlug}
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
