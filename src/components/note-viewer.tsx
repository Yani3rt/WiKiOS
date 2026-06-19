import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { usePersonImage } from "@/client/use-person-image";
import { useWikiConfig } from "@/client/wiki-config";
import { getTopicColor, type TopicAliasConfig } from "@/lib/wiki-config";
import type { WikiHeading, WikiNeighbor, WikiPageData } from "@/lib/wiki-shared";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

export interface NoteViewerProps {
  page: WikiPageData;
  onNavigateNote: (slug: string) => void;
  onRefreshPage?: () => void | Promise<void>;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

interface ParsedLink {
  label: string;
  href: string;
}

interface MiniNode {
  x: number;
  y: number;
  slug: string;
  title: string;
  color: string;
  size: number;
  isCenter: boolean;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function estimateReadingTime(markdown: string) {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).length;
}

function parseMarkdownLinks(section: string): ParsedLink[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: ParsedLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(section)) !== null) {
    links.push({ label: match[1], href: match[2] });
  }
  return links;
}

function splitContentSections(markdown: string) {
  const relatedMatch = markdown.match(/\n## Related Concepts\n([\s\S]*?)(?=\n## |\s*$)/);
  const sourceMatch = markdown.match(/\n## Source Notes\n([\s\S]*?)(?=\n## |\s*$)/);

  let mainContent = markdown;
  if (relatedMatch) {
    mainContent = mainContent.replace(`\n## Related Concepts\n${relatedMatch[1]}`, "");
  }
  if (sourceMatch) {
    mainContent = mainContent.replace(`\n## Source Notes\n${sourceMatch[1]}`, "");
  }

  return {
    mainContent: mainContent.trimEnd(),
    relatedLinks: relatedMatch ? parseMarkdownLinks(relatedMatch[1]) : [],
  };
}

function canonicalizeWikiRouteSlug(rawSlug: string) {
  return rawSlug
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return part;
      }
    })
    .join("/");
}

function getInternalWikiSlug(href: string | undefined) {
  if (!href || typeof window === "undefined") return null;

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/wiki/")) {
      return null;
    }

    return canonicalizeWikiRouteSlug(url.pathname.slice("/wiki/".length));
  } catch {
    return null;
  }
}

function scrollToHeading(id: string, scrollContainerRef?: RefObject<HTMLElement | null>) {
  const target = document.getElementById(id);
  if (!target) return;

  const scrollRoot = scrollContainerRef?.current;
  if (!scrollRoot) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = scrollRoot.scrollTop + targetRect.top - rootRect.top - 24;
  scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function TableOfContents({
  headings,
  activeId,
  scrollContainerRef,
}: {
  headings: WikiHeading[];
  activeId: string | null;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}) {
  if (headings.length === 0) return null;

  return (
    <nav className="toc space-y-0.5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        On this page
      </p>
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          onClick={(event) => {
            event.preventDefault();
            scrollToHeading(h.id, scrollContainerRef);
          }}
          className={`toc-item block text-[13px] leading-snug transition-colors duration-150 ${
            h.level === 3 ? "pl-3" : h.level >= 4 ? "pl-6" : ""
          } ${
            activeId === h.id
              ? "font-medium text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
          style={{ paddingTop: "0.3rem", paddingBottom: "0.3rem" }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}

function useActiveHeading(
  headings: WikiHeading[],
  scrollContainerRef?: RefObject<HTMLElement | null>,
) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);
  const observer = useRef<IntersectionObserver | null>(null);

  const updateActiveHeading = useCallback(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    const scrollRoot = scrollContainerRef?.current;
    const topThreshold = scrollRoot
      ? scrollRoot.getBoundingClientRect().top + 100
      : 100;

    let current = elements[0]?.id ?? null;
    for (const element of elements) {
      if (element.getBoundingClientRect().top <= topThreshold) {
        current = element.id;
      }
    }
    setActiveId(current);
  }, [headings, scrollContainerRef]);

  const observe = useCallback(() => {
    observer.current?.disconnect();

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    observer.current = new IntersectionObserver(updateActiveHeading, {
      root: scrollContainerRef?.current ?? null,
      rootMargin: "-60px 0px -80% 0px",
      threshold: [0, 1],
    });

    for (const element of elements) {
      observer.current.observe(element);
    }
  }, [headings, scrollContainerRef, updateActiveHeading]);

  useEffect(() => {
    setActiveId(headings[0]?.id ?? null);
    const timer = window.setTimeout(() => {
      observe();
      updateActiveHeading();
    }, 100);

    return () => {
      window.clearTimeout(timer);
      observer.current?.disconnect();
    };
  }, [headings, observe, updateActiveHeading]);

  useEffect(() => {
    const scrollRoot = scrollContainerRef?.current;
    const target: Window | HTMLElement = scrollRoot ?? window;
    const handleScroll = () => updateActiveHeading();

    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => target.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef, updateActiveHeading]);

  return activeId;
}

function miniColor(cats: string[], aliases: Record<string, TopicAliasConfig>): string {
  for (const category of cats) {
    return getTopicColor(category, aliases);
  }

  return "#666";
}

function computeScatteredLayout(
  currentTitle: string,
  currentCategories: string[],
  neighbors: WikiNeighbor[],
  width: number,
  height: number,
  aliases: Record<string, TopicAliasConfig>,
): MiniNode[] {
  const displayed = neighbors.slice(0, 14);
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes: MiniNode[] = [];

  nodes.push({
    x: centerX,
    y: centerY,
    slug: "",
    title: currentTitle,
    color: miniColor(currentCategories, aliases),
    size: 7,
    isCenter: true,
  });

  const spread = Math.min(width, height) * 0.38;
  for (let index = 0; index < displayed.length; index += 1) {
    const neighbor = displayed[index];
    const angle = index * 2.399963 + 0.5;
    const radius = spread * (0.4 + 0.6 * Math.sqrt((index + 1) / (displayed.length + 1)));
    const jitter = ((neighbor.title.length * 7 + index * 13) % 20 - 10) * 0.02;
    nodes.push({
      x: centerX + Math.cos(angle + jitter) * radius,
      y: centerY + Math.sin(angle + jitter) * radius,
      slug: canonicalizeWikiRouteSlug(neighbor.slug),
      title: neighbor.title,
      color: miniColor(neighbor.categories, aliases),
      size: Math.max(2.5, Math.min(5.5, 2.5 + Math.sqrt(neighbor.backlinkCount) * 0.6)),
      isCenter: false,
    });
  }

  return nodes;
}

function NeighborhoodGraph({
  currentTitle,
  currentCategories,
  neighbors,
  onClickNode,
  aliases,
}: {
  currentTitle: string;
  currentCategories: string[];
  neighbors: WikiNeighbor[];
  onClickNode: (slug: string) => void;
  aliases: Record<string, TopicAliasConfig>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const layoutRef = useRef<MiniNode[]>([]);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);

      const nodes = computeScatteredLayout(
        currentTitle,
        currentCategories,
        neighbors,
        width,
        height,
        aliases,
      );
      layoutRef.current = nodes;

      context.fillStyle = "#f5f5f4";
      context.fillRect(0, 0, width, height);

      const center = nodes[0];
      for (let index = 1; index < nodes.length; index += 1) {
        const node = nodes[index];
        context.beginPath();
        context.moveTo(center.x, center.y);
        context.lineTo(node.x, node.y);
        context.strokeStyle = hoveredIdx === index ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.06)";
        context.lineWidth = hoveredIdx === index ? 1 : 0.5;
        context.stroke();
      }

      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        const isHovered = hoveredIdx === index;
        const drawSize = isHovered ? node.size * 1.5 : node.size;

        if (isHovered) {
          context.beginPath();
          context.arc(node.x, node.y, drawSize + 4, 0, Math.PI * 2);
          context.fillStyle = `${node.color}30`;
          context.fill();
        }

        context.beginPath();
        context.arc(node.x, node.y, drawSize, 0, Math.PI * 2);
        context.fillStyle = node.color;
        context.fill();

        if (node.isCenter || isHovered) {
          context.font = `${node.isCenter ? "500" : "400"} ${node.isCenter ? 9 : 8}px "SF Pro Display", -apple-system, sans-serif`;
          context.fillStyle = node.isCenter ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)";
          context.textAlign = "center";
          context.fillText(
            node.title.length > 20 ? `${node.title.slice(0, 18)}...` : node.title,
            node.x,
            node.y + drawSize + 11,
          );
        }
      }
    };

    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [aliases, currentCategories, currentTitle, dpr, hoveredIdx, neighbors]);

  const handleMouseMove = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let found = -1;
    for (let index = 1; index < layoutRef.current.length; index += 1) {
      const node = layoutRef.current[index];
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (distance < 16) {
        found = index;
        break;
      }
    }

    setHoveredIdx(found >= 0 ? found : null);
    canvas.style.cursor = found >= 0 ? "pointer" : "default";
  }, []);

  const handleClick = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (let index = 1; index < layoutRef.current.length; index += 1) {
      const node = layoutRef.current[index];
      if (Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2) < 16) {
        onClickNode(node.slug);
        return;
      }
    }
  }, [onClickNode]);

  if (neighbors.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        Connections
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <canvas
          ref={canvasRef}
          className="h-56 w-full"
          onClick={handleClick}
          onMouseLeave={() => setHoveredIdx(null)}
          onMouseMove={handleMouseMove}
        />
      </div>
      {neighbors.length > 14 ? (
        <p className="mt-1.5 text-center text-[10px] text-[var(--muted-foreground)]">
          +{neighbors.length - 14} more connections
        </p>
      ) : null}
    </div>
  );
}

export function NoteViewer({
  page,
  onNavigateNote,
  onRefreshPage,
  scrollContainerRef,
}: NoteViewerProps) {
  const config = useWikiConfig();
  const portraitUrl = usePersonImage(page.isPerson ? page.title : null);
  const [personOverrideError, setPersonOverrideError] = useState<string | null>(null);
  const [isUpdatingPerson, setIsUpdatingPerson] = useState(false);
  const filteredHeadings = useMemo(
    () => page.headings.filter((heading) => heading.text !== "Source Notes"),
    [page.headings],
  );
  const activeId = useActiveHeading(filteredHeadings, scrollContainerRef);
  const readTime = estimateReadingTime(page.contentMarkdown);
  const words = wordCount(page.contentMarkdown);
  const { mainContent, relatedLinks } = splitContentSections(page.contentMarkdown);
  const peopleControlsEnabled = config.people.mode !== "off";
  const personPrimaryLabel =
    page.personOverride === "not-person" || (!page.isPerson && page.personOverride === null)
      ? "Mark as person"
      : "Mark as not person";
  const personPrimaryTarget = personPrimaryLabel === "Mark as person" ? "person" : "not-person";
  const pageRehypePlugins = page.hasCodeBlocks ? rehypePlugins : [];
  const onNavigateNoteRef = useRef(onNavigateNote);

  useEffect(() => {
    onNavigateNoteRef.current = onNavigateNote;
  }, [onNavigateNote]);

  useEffect(() => {
    const scrollRoot = scrollContainerRef?.current;
    if (scrollRoot) {
      scrollRoot.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.scrollTo(0, 0);
  }, [page.slug, scrollContainerRef]);

  const personActionBusy = isUpdatingPerson;

  const markdownComponents = useMemo<Components>(
    () => ({
      h1: (props) => <h1 className="mb-4 scroll-mt-20 text-3xl" {...props} />,
      h2: (props) => (
        <h2 className="font-display mb-3 mt-10 scroll-mt-20 text-xl font-light" {...props} />
      ),
      h3: (props) => (
        <h3 className="font-display mb-2 mt-7 scroll-mt-20 text-lg font-light" {...props} />
      ),
      h4: (props) => <h4 className="mb-2 mt-5 scroll-mt-20 text-base font-medium" {...props} />,
      p: (props) => <p className="mb-4 leading-[1.8]" {...props} />,
      ul: (props) => <ul className="mb-4 list-disc pl-6 leading-[1.8]" {...props} />,
      ol: (props) => <ol className="mb-4 list-decimal pl-6 leading-[1.8]" {...props} />,
      li: (props) => <li className="mb-1.5" {...props} />,
      blockquote: (props) => <blockquote className="my-4" {...props} />,
      a: ({ href, onClick, ...props }) => {
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          if (event.defaultPrevented) return;

          const slug = getInternalWikiSlug(href);
          if (!slug) return;

          event.preventDefault();
          onNavigateNoteRef.current(slug);
        };

        return <a href={href} onClick={handleClick} {...props} />;
      },
    }),
    [],
  );

  const navigateToRelatedNote = useCallback(
    (href: string) => {
      const slug = getInternalWikiSlug(href);
      if (!slug) return false;
      onNavigateNote(slug);
      return true;
    },
    [onNavigateNote],
  );

  const navigateToGraphNote = useCallback(
    (slug: string) => onNavigateNote(canonicalizeWikiRouteSlug(slug)),
    [onNavigateNote],
  );

  const updatePersonOverride = useCallback(
    async (nextOverride: "person" | "not-person" | null) => {
      setIsUpdatingPerson(true);
      setPersonOverrideError(null);

      try {
        const response = await fetch("/api/setup/person-override", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            file: page.fileName,
            override: nextOverride,
          }),
        });

        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not update person override");
        }

        await onRefreshPage?.();
      } catch (error) {
        setPersonOverrideError(
          error instanceof Error ? error.message : "Could not update person override",
        );
      } finally {
        setIsUpdatingPerson(false);
      }
    },
    [onRefreshPage, page.fileName],
  );

  return (
    <>
      <div className="mb-6 flex items-start gap-4 sm:mb-10 sm:gap-5">
        {page.isPerson && portraitUrl ? (
          <img
            src={portraitUrl}
            alt={page.title}
            loading="eager"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-[0_8px_24px_-12px_rgba(21,19,26,0.25)] sm:h-24 sm:w-24"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-light leading-[1.05] tracking-tight text-[var(--foreground)] sm:text-5xl">
            {page.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]/60">
            <span>{readTime} min read</span>
            <span className="select-none">·</span>
            <span>{words.toLocaleString()} words</span>
            {page.modifiedAt > 0 ? (
              <>
                <span className="select-none">·</span>
                <span>Updated {formatDate(page.modifiedAt)}</span>
              </>
            ) : null}
            {peopleControlsEnabled ? (
              <>
                <span className="select-none">·</span>
                <button
                  type="button"
                  onClick={() => void updatePersonOverride(personPrimaryTarget)}
                  disabled={personActionBusy}
                  className="underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70"
                >
                  {personActionBusy ? "Saving..." : personPrimaryLabel}
                </button>
                {page.personOverride !== null ? (
                  <>
                    <span className="select-none">·</span>
                    <button
                      type="button"
                      onClick={() => void updatePersonOverride(null)}
                      disabled={personActionBusy}
                      className="underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70"
                    >
                      Clear override
                    </button>
                  </>
                ) : null}
                {personOverrideError ? <span className="text-red-600">{personOverrideError}</span> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {filteredHeadings.length > 0 ? (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-white px-4 py-3 lg:hidden">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            On this page
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {filteredHeadings.filter((heading) => heading.level <= 2).map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToHeading(heading.id, scrollContainerRef);
                }}
                className="text-sm text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--foreground)]"
              >
                {heading.text}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <article className="prose-wiki leading-[1.8]">
          <ReactMarkdown
            rehypePlugins={pageRehypePlugins}
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
          >
            {mainContent}
          </ReactMarkdown>
        </article>

        {relatedLinks.length > 0 ? (
          <section id="related-concepts" className="mt-10 scroll-mt-20">
            <h2 className="font-display mb-4 border-b border-[var(--border)] pb-2 text-xl font-light text-[var(--foreground)]">
              Related Concepts
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={(event) => {
                    if (navigateToRelatedNote(link.href)) {
                      event.preventDefault();
                    }
                  }}
                  className="rounded-full border border-[var(--border)] bg-white px-3.5 py-1.5 text-sm transition-[color,background-color,transform] duration-150 hover:bg-[var(--secondary)] active:scale-[0.97]"
                >
                  <span className="font-display font-light text-[var(--foreground)]">{link.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <aside className="absolute -right-60 top-0 hidden w-52 xl:block">
          <div className="sticky top-8">
            {filteredHeadings.length > 0 ? (
              <TableOfContents
                headings={filteredHeadings}
                activeId={activeId}
                scrollContainerRef={scrollContainerRef}
              />
            ) : null}
            {page.neighbors.length > 0 ? (
              <NeighborhoodGraph
                currentTitle={page.title}
                currentCategories={page.categories}
                neighbors={page.neighbors}
                onClickNode={navigateToGraphNote}
                aliases={config.categories.aliases}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
