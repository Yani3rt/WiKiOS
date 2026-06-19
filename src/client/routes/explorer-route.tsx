import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  redirect,
  useLoaderData,
  useNavigate,
  useParams,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
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

type ReaderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; page: WikiPageData }
  | { status: "missing" }
  | { status: "error" };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugFromSplat(rawSplat: string | undefined) {
  return (rawSplat ?? "")
    .split("/")
    .filter(Boolean)
    .map(safeDecode)
    .join("/");
}

function encodeSlug(slug: string) {
  return slug
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function explorerPath(slug: string | null) {
  return slug ? `/explorer/${encodeSlug(slug)}` : "/explorer";
}

function fallbackTab(slug: string): ExplorerTab {
  const finalSegment = slug.split("/").at(-1) || slug;
  return { slug, title: safeDecode(finalSegment), file: `${slug}.md` };
}

function readStoredWorkspace(): ExplorerWorkspace {
  if (typeof window === "undefined") return EMPTY_EXPLORER_WORKSPACE;
  const stored = window.localStorage.getItem(EXPLORER_STORAGE_KEY);
  return stored ? parseExplorerWorkspace(stored) : EMPTY_EXPLORER_WORKSPACE;
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
  onActivate,
  onClose,
  onCloseOthers,
}: {
  workspace: ExplorerWorkspace;
  onActivate: (slug: string) => void;
  onClose: (slug: string) => void;
  onCloseOthers: (slug: string) => void;
}) {
  if (workspace.tabs.length === 0) return null;

  return (
    <div className="flex min-h-11 overflow-x-auto border-b border-[var(--border)]" role="tablist" aria-label="Open notes">
      {workspace.tabs.map((tab) => {
        const active = tab.slug === workspace.activeSlug;
        return (
          <div key={tab.slug} className="flex shrink-0 items-center border-r border-[var(--border)]">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={`h-full max-w-52 truncate px-3 text-sm ${active ? "bg-[var(--background)] font-medium" : "bg-[var(--muted)]"}`}
              onClick={() => onActivate(tab.slug)}
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
          components={{
            h1: (props) => <h1 className="mb-4 scroll-mt-20 text-3xl" {...props} />,
            h2: (props) => <h2 className="font-display mb-3 mt-10 scroll-mt-20 text-xl" {...props} />,
            h3: (props) => <h3 className="font-display mb-2 mt-7 scroll-mt-20 text-lg" {...props} />,
            p: (props) => <p className="mb-4 leading-[1.8]" {...props} />,
            ul: (props) => <ul className="mb-4 list-disc pl-6 leading-[1.8]" {...props} />,
            ol: (props) => <ol className="mb-4 list-decimal pl-6 leading-[1.8]" {...props} />,
            a: ({ href, onClick, ...props }) => {
              const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
                onClick?.(event);
                if (event.defaultPrevented || !href) return;
                const url = new URL(href, window.location.origin);
                if (url.origin === window.location.origin && url.pathname.startsWith("/wiki/")) {
                  event.preventDefault();
                  onWikiLink(slugFromSplat(url.pathname.slice("/wiki/".length)));
                }
              };
              return <a href={href} onClick={handleClick} {...props} />;
            },
          }}
        >
          {page.contentMarkdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}

export function Component() {
  const pages = useLoaderData() as ExplorerPage[];
  const params = useParams();
  const navigate = useNavigate();
  const urlSlug = slugFromSplat(params["*"]);
  const pageBySlug = useMemo(() => new Map(pages.map((page) => [page.slug, page])), [pages]);
  const [workspace, setWorkspace] = useState<ExplorerWorkspace>(readStoredWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readerState, setReaderState] = useState<ReaderState>({ status: "idle" });

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(EXPLORER_STORAGE_KEY, serializeExplorerWorkspace(workspace));
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
      setReaderState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setReaderState({ status: "loading" });
    fetchJson<WikiPageData>(`/api/wiki/${encodeSlug(slug)}`, { signal: controller.signal })
      .then((page) => setReaderState({ status: "ready", page }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isSetupRequiredResponse(error)) {
          navigate("/setup");
          return;
        }
        setReaderState(error instanceof Response && error.status === 404 ? { status: "missing" } : { status: "error" });
      });
    return () => controller.abort();
  }, [navigate, workspace.activeSlug]);

  const transitionAndNavigate = useCallback(
    (transition: (current: ExplorerWorkspace) => ExplorerWorkspace) => {
      const next = transition(workspace);
      setWorkspace(next);
      navigate(explorerPath(next.activeSlug));
    },
    [navigate, workspace],
  );

  const selectPage = (page: ExplorerPage) => {
    setSidebarOpen(false);
    transitionAndNavigate((current) => openExplorerTab(current, page));
  };

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
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Explorer workspace">
          <ExplorerTabs
            workspace={workspace}
            onActivate={(slug) => transitionAndNavigate((current) => activateExplorerTab(current, slug))}
            onClose={(slug) => transitionAndNavigate((current) => closeExplorerTab(current, slug))}
            onCloseOthers={(slug) => transitionAndNavigate((current) => closeOtherExplorerTabs(current, slug))}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ExplorerReader
              state={readerState}
              hasTabs={workspace.tabs.length > 0}
              onWikiLink={(slug) => navigate(explorerPath(slug))}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
