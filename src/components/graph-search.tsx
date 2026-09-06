import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import type { GraphNode } from "@/lib/wiki-shared";
import type { GraphViewState } from "@/client/graph-view-state";
import { getGraphIndexNodes, getNextGraphIndex, GRAPH_INDEX_INITIAL_VISIBLE_COUNT, GRAPH_INDEX_LOAD_MORE_COUNT, shouldCloseGraphNodeIndexOnDetailExpand } from "@/client/graph-overview-model";

/* ── Search ── */

export function GraphSearch({
  nodes,
  onSelect,
  onCompactSearchInteraction,
  detailPanelCollapsed,
  selectedSlug,
  searchInputRef,
  search,
  setSearch,
}: {
  nodes: GraphNode[];
  onSelect: (slug: string) => void;
  onCompactSearchInteraction: () => void;
  detailPanelCollapsed: boolean;
  selectedSlug: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  search: GraphViewState["search"];
  setSearch: React.Dispatch<React.SetStateAction<GraphViewState["search"]>>;
}) {
  const {query, indexOpen, visibleResultCount} = search;
  const setQuery = useCallback((query: string) => setSearch(current => ({...current, query})), [setSearch]);
  const setIndexOpen = useCallback((indexOpen: boolean) => setSearch(current => ({...current, indexOpen})), [setSearch]);
  const setVisibleResultCount = useCallback((value: React.SetStateAction<number>) => setSearch(current => ({...current, visibleResultCount: typeof value === "function" ? value(current.visibleResultCount) : value})), [setSearch]);
  const [indexClosing, setIndexClosing] = useState(false);
  const [rovingSlug, setRovingSlug] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressFocusOpenRef = useRef(false);
  const previousDetailPanelCollapsedRef = useRef(detailPanelCollapsed);
  const results = useMemo(() => getGraphIndexNodes(nodes, query), [nodes, query]);
  const visibleResults = useMemo(
    () => results.slice(0, visibleResultCount),
    [results, visibleResultCount],
  );
  const panelOpen = indexOpen || query.trim().length > 0;

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (visibleResults.length === 0) {
      setRovingSlug(null);
    } else if (!rovingSlug || !visibleResults.some((node) => node.slug === rovingSlug)) {
      setRovingSlug(visibleResults[0].slug);
    }
  }, [visibleResults, rovingSlug]);

  const focusResult = (index: number) => {
    const result = visibleResults[index];
    if (!result) return;
    setRovingSlug(result.slug);
    requestAnimationFrame(() => itemRefs.current.get(result.slug)?.focus());
  };

  const handleResultKeyDown = (event: React.KeyboardEvent, currentIndex: number) => {
    const nextIndex = getNextGraphIndex(currentIndex, event.key, visibleResults.length);
    if (nextIndex === null) return;
    event.preventDefault();
    focusResult(nextIndex);
  };

  const cancelPendingClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIndexClosing(false);
  }, []);

  const restoreFocus = useCallback(() => {
    if (window.innerWidth < 640) {
      searchInputRef.current?.blur();
      rootRef.current?.focus({preventScroll:true});
    } else {
      suppressFocusOpenRef.current = true;
      searchInputRef.current?.focus({preventScroll:true});
      suppressFocusOpenRef.current = false;
    }
  }, [searchInputRef]);

  const closeIndex = useCallback((returnFocus: boolean) => {
    cancelPendingClose();
    setQuery("");
    setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndexOpen(false);
      if (returnFocus) requestAnimationFrame(restoreFocus);
      return;
    }

    setIndexOpen(true);
    setIndexClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIndexOpen(false);
      setIndexClosing(false);
      if (returnFocus) requestAnimationFrame(restoreFocus);
    }, 160);
  }, [restoreFocus, cancelPendingClose, setQuery, setIndexOpen, setVisibleResultCount]);

  useEffect(() => {
    const wasCollapsed = previousDetailPanelCollapsedRef.current;
    previousDetailPanelCollapsedRef.current = detailPanelCollapsed;

    if (
      panelOpen &&
      shouldCloseGraphNodeIndexOnDetailExpand(
        window.innerWidth,
        wasCollapsed,
        detailPanelCollapsed,
      )
    ) {
      closeIndex(false);
    }
  }, [closeIndex, detailPanelCollapsed, panelOpen]);

  const openIndex = () => {
    if (suppressFocusOpenRef.current) return;
    cancelPendingClose();
    onCompactSearchInteraction();
    setIndexOpen(true);
  };

  useEffect(() => {
    if (!panelOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        searchInputRef.current?.blur();
        closeIndex(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [panelOpen, closeIndex, searchInputRef]);

  const handleSelect = (slug: string) => {
    onSelect(slug);
    setRovingSlug(slug);
    searchInputRef.current?.blur();
    closeIndex(true);
  };

  return (
    <div ref={rootRef} role="search" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape" && panelOpen) {
          event.preventDefault();
          event.stopPropagation();
          closeIndex(true);
        }
      }}
      onBlur={event => {
        if (panelOpen && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeIndex(false);
      }}
      className="graph-search absolute left-4 right-4 z-10 sm:left-6 sm:right-auto sm:w-80">
      {panelOpen && <div className="graph-search-dismiss" aria-hidden="true" onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        searchInputRef.current?.blur();
        closeIndex(false);
      }}/>}
      <div id="graph-search-controls" className="flex gap-2">
        <Link to="/" className="graph-home-link graph-surface" aria-label="Home"><ArrowLeft size={16} aria-hidden="true"/><span>Home</span></Link>
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onFocus={openIndex}
          onClick={openIndex}
          onChange={(event) => {
            cancelPendingClose();
            setQuery(event.target.value);
            setIndexOpen(true);
            setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && visibleResults.length > 0) {
              event.preventDefault();
              openIndex();
              focusResult(0);
            }
          }}
          placeholder="Find a concept..."
          aria-label="Find a concept"
          aria-controls="graph-node-index"
          aria-expanded={panelOpen}
          className="graph-surface min-w-0 flex-1 rounded-lg px-4 py-2.5 text-sm text-[var(--graph-foreground)] outline-none placeholder:text-[var(--graph-muted)]"
        />
      </div>

      {panelOpen && (
        <section
          id="graph-node-index"
          className={`graph-node-index-panel graph-surface-raised mt-2 overflow-hidden rounded-xl ${
            indexClosing ? "graph-node-index-panel--closing" : ""
          }`}
          data-state={indexClosing ? "closing" : "open"}
          aria-labelledby="graph-node-index-title"
        >
          <div className="flex min-h-11 items-center justify-between border-b border-[var(--graph-border)] px-3 py-2">
            <div className="min-w-0">
              <h2 id="graph-node-index-title" className="text-sm font-semibold text-[var(--graph-foreground)]">
                {query.trim() ? "Matching notes" : "All notes"}
              </h2>
              <p className="text-xs text-[var(--graph-muted)]">
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => closeIndex(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]"
              aria-label="Close node index"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <p className="sr-only">Use the arrow keys to move between notes and Enter to select.</p>
          {results.length > 0 ? (
            <ul className="graph-node-index-list max-h-[14.25rem] sm:max-h-[min(62vh,34rem)] overflow-y-auto py-1">
              {visibleResults.map((node, index) => {
                const connectionCount = node.neighbors.length;
                return (
                  <li key={node.slug}>
                    <button
                      ref={(element) => {
                        if (element) itemRefs.current.set(node.slug, element);
                        else itemRefs.current.delete(node.slug);
                      }}
                      type="button"
                      tabIndex={rovingSlug === node.slug ? 0 : -1}
                      onFocus={() => setRovingSlug(node.slug)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelect(node.slug);
                          return;
                        }
                        handleResultKeyDown(event, index);
                      }}
                      onClick={() => handleSelect(node.slug)}
                      aria-current={selectedSlug === node.slug ? "true" : undefined}
                      aria-label={`${node.title}, ${connectionCount} ${
                        connectionCount === 1 ? "connection" : "connections"
                      }`}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--graph-control-hover)] focus-visible:bg-[var(--graph-control-hover)] aria-[current=true]:bg-[var(--graph-control-hover)]"
                    >
                      <span className="min-w-0 break-words text-sm font-medium text-[var(--graph-foreground)]">
                        {node.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--graph-muted)]">
                        {connectionCount}
                      </span>
                    </button>
                  </li>
                );
              })}
              {visibleResults.length < results.length && (
                <li className="border-t border-[var(--graph-border)]">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleResultCount((count) =>
                        Math.min(results.length, count + GRAPH_INDEX_LOAD_MORE_COUNT),
                      )
                    }
                    className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-sm font-semibold text-[var(--graph-foreground)] transition-colors hover:bg-[var(--graph-control-hover)] focus-visible:bg-[var(--graph-control-hover)]"
                    aria-label={`Load ${Math.min(
                      GRAPH_INDEX_LOAD_MORE_COUNT,
                      results.length - visibleResults.length,
                    )} more notes`}
                  >
                    <span>Load more</span>
                    <span className="text-xs font-normal tabular-nums text-[var(--graph-muted)]">
                      {visibleResults.length} of {results.length}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-[var(--graph-muted)]">
              No notes match “{query.trim()}”. Try a title, path, or category.
            </p>
          )}

          {!query.trim() && nodes.length > results.length && (
            <p className="border-t border-[var(--graph-border)] px-3 py-2 text-xs text-[var(--graph-muted)]">
              Showing the first {results.length} notes. Search to narrow the full vault.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
