import { ArrowDownLeft, ArrowUpRight, Network, X } from "lucide-react";
import { useEffect, useState, useMemo, type RefObject } from "react";
import { Link } from "react-router-dom";
import { fetchJson } from "@/client/api";
import { encodeWikiSlugSegments } from "@/client/wiki-slug-encoding";
import { useWikiConfig } from "@/client/wiki-config";
import type { WikiConnections, WikiPageData } from "@/lib/wiki-shared";
import { NeighborhoodGraph, TableOfContents, useActiveHeading } from "./note-viewer";

export function WorkspaceConnections({ page, onSelect, onClose, onNavigateHeading, scrollRef }: {
  page: WikiPageData; onSelect: (slug: string) => void; onClose: () => void;
  onNavigateHeading?: () => void;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const [mode, setMode] = useState<"links" | "map">("links");
  const [result, setResult] = useState<{slug: string; data?: WikiConnections; error?: boolean} | null>(null);
  const [retry, setRetry] = useState(0);
  const config = useWikiConfig();
  const headings = useMemo(() => page.headings.filter(heading => heading.text !== "Source Notes"), [page.headings]);
  const activeId = useActiveHeading(headings, scrollRef);
  useEffect(() => {
    const controller = new AbortController();
    const slug = page.slug;
    void fetchJson<WikiConnections>(`/api/connections/${encodeWikiSlugSegments(page.fileName.replace(/\.md$/iu, ""), 2)}`, {signal: controller.signal})
      .then(data => { if (!controller.signal.aborted) setResult({slug, data}); })
      .catch(() => { if (!controller.signal.aborted) setResult({slug, error: true}); });
    return () => controller.abort();
  }, [page.slug, page.fileName, page.modifiedAt, retry]);
  const current = result?.slug === page.slug ? result : null;
  return <aside className="workspace-connections" aria-label="Connections">
    <header><h2>Connections</h2><button className="workspace-icon" onClick={onClose} aria-label="Close connections"><X size={17}/></button></header>
    <div className="connection-mode" role="group" aria-label="Connection view">
      <button aria-pressed={mode === "links"} onClick={() => setMode("links")}>Links</button>
      <button aria-pressed={mode === "map"} onClick={() => setMode("map")}>Map</button>
    </div>
    <div className="connections-scroll explorer-scrollbar">
      {mode === "map" ? <NeighborhoodGraph currentTitle={page.title} currentCategories={page.categories} neighbors={page.neighbors} onClickNode={onSelect} aliases={config.categories.aliases} showHeading={false}/> : !current ? <p role="status" className="connection-status">Loading connections…</p> : current.error ? <div className="connection-status" role="status">Could not load connections. <button onClick={() => setRetry(n => n + 1)}>Retry</button></div> : current.data ? <>
        {(["outgoing", "incoming"] as const).map(direction => <section className="connection-section" key={direction}>
          <h3>{direction === "outgoing" ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>} {direction === "outgoing" ? "Outgoing" : "Incoming"}<span>{current.data![direction].length}</span></h3>
          {current.data![direction].length === 0 ? <p className="connection-status">No {direction} links</p> : current.data![direction].map(note => <button className="connection-note" data-note-slug={note.slug.split("/").map(decodeURIComponent).join("/")} key={note.slug} onClick={() => onSelect(note.slug)}>
            <span>{note.title}</span>{direction === "incoming" && note.excerpt ? <blockquote>{note.excerpt}</blockquote> : null}
          </button>)}
        </section>)}
      </> : null}
      {headings.length > 0 && <section className="connection-toc"><TableOfContents headings={headings} activeId={activeId} scrollContainerRef={scrollRef} onNavigate={onNavigateHeading}/></section>}
    </div>
    <Link to="/graph" className="workspace-graph-link"><Network size={16}/>Open full graph<ArrowUpRight size={14}/></Link>
  </aside>;
}
