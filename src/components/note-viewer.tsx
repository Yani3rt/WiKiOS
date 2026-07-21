import {
  Children,
  type ComponentPropsWithoutRef,
  isValidElement,
  useId,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { usePersonImage } from "@/client/use-person-image";
import { useWikiConfig } from "@/client/wiki-config";
import { createHeadingId } from "@/lib/markdown";
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

type ClipboardWriter = (text: string) => Promise<void>;
type CodeBlockPreProps = ComponentPropsWithoutRef<"pre"> & {
  node?: unknown;
  children?: ReactNode;
};

let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;

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

function markdownNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(markdownNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return markdownNodeText(node.props.children);
  }
  return "";
}

function renderedHeadingId(children: ReactNode, existingId?: string) {
  return existingId ?? createHeadingId(markdownNodeText(children));
}

function looksLikeAsciiDiagramBlock(text: string) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 3) return false;

  const treeLines = lines.filter((line) => /[│├└─]/u.test(line));
  const commentedLines = lines.filter((line) => / {2,}#\s/u.test(line));
  const pathLines = lines.filter((line) => /\/$|\.md(?:\s|$)/u.test(line.trim()));

  return treeLines.length >= 2 && (commentedLines.length >= 1 || pathLines.length >= 3);
}

function codeBlockLanguage(children: ReactNode) {
  const codeChild = Children.toArray(children).find(isValidElement);
  if (!isValidElement<{ className?: string }>(codeChild)) return null;

  return codeChild.props.className?.match(/(?:^|\s)language-([^\s]+)/u)?.[1] ?? null;
}

export function renderedCodeBlockText(children: ReactNode) {
  const codeChild = Children.toArray(children).find(isValidElement);
  if (!isValidElement<{ children?: ReactNode }>(codeChild)) return markdownNodeText(children);

  return markdownNodeText(codeChild.props.children);
}

export async function copyCodeBlockText(codeText: string, writeText: ClipboardWriter) {
  await writeText(codeText);
}

async function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
      });
      return module;
    });
  }

  return mermaidModulePromise;
}

function MermaidBlock({ codeText }: { codeText: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const renderId = useId().replace(/:/gu, "");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await loadMermaid()).default;
        const { svg: nextSvg } = await mermaid.render(`note-mermaid-${renderId}`, codeText);
        if (!cancelled) {
          setSvg(nextSvg);
          setRenderFailed(false);
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
          setRenderFailed(true);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [codeText, renderId]);

  return (
    <div className="note-mermaid-block" data-mermaid-source={codeText}>
      {svg ? (
        <div
          aria-label="Mermaid diagram"
          className="note-mermaid-render"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      {!svg || renderFailed ? (
        <pre className="note-mermaid-fallback">
          <code>{codeText}</code>
        </pre>
      ) : null}
    </div>
  );
}

function CopyableCodeBlock({
  children,
  className,
  language,
  codeText,
  ...props
}: Omit<CodeBlockPreProps, "node"> & { language: string | null; codeText: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeoutId = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (!writeText) return;

    try {
      await copyCodeBlockText(codeText, writeText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [codeText]);

  return (
    <pre
      {...props}
      className={["code-block-shell", className, language ? "code-block-has-language" : null]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="code-copy-button"
        aria-label="Copy code"
        onClick={handleCopy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {language ? (
        <span
          aria-hidden="true"
          className="code-language-label"
          data-code-language={language}
        >
          {language.toUpperCase()}
        </span>
      ) : null}
      {children}
    </pre>
  );
}

function CodeBlockPre({
  node,
  children,
  className,
  ...props
}: CodeBlockPreProps) {
  void node;
  const language = codeBlockLanguage(children);
  const codeText = renderedCodeBlockText(children);

  if (language === "mermaid") {
    return <MermaidBlock codeText={codeText.trim()} />;
  }

  return (
    <CopyableCodeBlock
      {...props}
      className={className}
      language={language}
      codeText={codeText}
    >
      {children}
    </CopyableCodeBlock>
  );
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

export function canonicalizeWikiRouteSlug(rawSlug: string) {
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

export function wikiSlugFromHref(href: string | undefined, origin: string) {
  if (!href || href.startsWith("#")) return null;

  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/wiki/")) {
      return null;
    }

    return canonicalizeWikiRouteSlug(url.pathname.slice("/wiki/".length));
  } catch {
    return null;
  }
}

interface LinkNavigationEvent {
  defaultPrevented: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault(): void;
}

interface WikiLinkClickBehaviorOptions {
  href: string | undefined;
  origin: string;
  target?: string | null;
  download?: string | boolean | null;
  event: LinkNavigationEvent;
}

interface RouteWikiLinkClickOptions {
  href: string | undefined;
  origin: string;
  target?: string | null;
  download?: string | boolean | null;
  onNavigateNote: (slug: string) => void;
  event: LinkNavigationEvent;
}

export function shouldInterceptWikiLinkClick({
  href,
  origin,
  target,
  download,
  event,
}: WikiLinkClickBehaviorOptions) {
  if (event.defaultPrevented) return false;
  if (event.button !== undefined && event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (download !== undefined && download !== null && download !== false) return false;
  if (target && target.toLowerCase() !== "_self") return false;

  return wikiSlugFromHref(href, origin) !== null;
}

export function routeWikiLinkClick({
  href,
  origin,
  target,
  download,
  onNavigateNote,
  event,
}: RouteWikiLinkClickOptions) {
  if (!shouldInterceptWikiLinkClick({ href, origin, target, download, event })) return false;

  const slug = wikiSlugFromHref(href, origin);
  if (!slug) return false;

  event.preventDefault();
  onNavigateNote(slug);
  return true;
}

export function navigateGraphNode(slug: string, onNavigateNote: (slug: string) => void) {
  onNavigateNote(canonicalizeWikiRouteSlug(slug));
}

interface PersonOverrideResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

interface SavePersonOverrideOptions {
  fileName: string;
  override: "person" | "not-person" | null;
  onRefreshPage?: () => void | Promise<void>;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<PersonOverrideResponse>;
}

export async function savePersonOverride({
  fileName,
  override,
  onRefreshPage,
  fetchImpl = fetch,
}: SavePersonOverrideOptions) {
  const response = await fetchImpl("/api/setup/person-override", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      file: fileName,
      override,
    }),
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not update person override");
  }

  await onRefreshPage?.();
}

interface ScrollTargetLike {
  scrollIntoView(options: { behavior: "smooth"; block: "start" }): void;
}

interface HeadingElementLike {
  id: string;
  getBoundingClientRect(): { top: number };
}

interface ScrollRootRectLike {
  getBoundingClientRect(): { top: number };
}

interface HeadingLookupRootLike {
  querySelector(selector: string): ScrollTargetLike | null;
}

interface HeadingLookupDocumentLike {
  getElementById(id: string): ScrollTargetLike | null;
}

export function getScrollRoot<T>(scrollContainerRef?: RefObject<T | null>): T | null {
  return scrollContainerRef?.current ?? null;
}

function escapeHeadingSelector(id: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

export function resolveHeadingTarget(
  id: string,
  scrollRoot: HeadingLookupRootLike | null,
  doc: HeadingLookupDocumentLike = document,
) {
  const rootTarget = scrollRoot?.querySelector(`#${escapeHeadingSelector(id)}`) ?? null;
  return rootTarget ?? doc.getElementById(id);
}

export function scrollHeadingIntoView(target: ScrollTargetLike, _scrollRoot?: unknown) {
  void _scrollRoot;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function scrollToHeading(
  id: string,
  scrollContainerRef?: RefObject<HTMLElement | null>,
  doc: HeadingLookupDocumentLike = document,
) {
  const scrollRoot = getScrollRoot(scrollContainerRef);
  const target = resolveHeadingTarget(id, scrollRoot, doc);
  if (!target) return;

  scrollHeadingIntoView(target, scrollRoot);
}

export function getActiveHeadingId(
  elements: HeadingElementLike[],
  scrollRoot: ScrollRootRectLike | null,
) {
  if (elements.length === 0) return null;

  const topThreshold = scrollRoot ? scrollRoot.getBoundingClientRect().top + 100 : 100;
  let current = elements[0]?.id ?? null;
  for (const element of elements) {
    if (element.getBoundingClientRect().top <= topThreshold) {
      current = element.id;
    }
  }

  return current;
}

export function handleTocHeadingClick(
  event: LinkNavigationEvent,
  id: string,
  scrollContainerRef?: RefObject<HTMLElement | null>,
) {
  event.preventDefault();
  scrollToHeading(id, scrollContainerRef);
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
          onClick={(event) => handleTocHeadingClick(event, h.id, scrollContainerRef)}
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
    setActiveId(getActiveHeadingId(elements, getScrollRoot(scrollContainerRef)));
  }, [headings, scrollContainerRef]);

  const observe = useCallback(() => {
    observer.current?.disconnect();

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);

    if (elements.length === 0) return;

    observer.current = new IntersectionObserver(updateActiveHeading, {
      root: getScrollRoot(scrollContainerRef),
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
    const scrollRoot = getScrollRoot(scrollContainerRef);
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
  showHeading = true,
}: {
  currentTitle: string;
  currentCategories: string[];
  neighbors: WikiNeighbor[];
  onClickNode: (slug: string) => void;
  aliases: Record<string, TopicAliasConfig>;
  showHeading?: boolean;
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

      context.fillStyle =
        getComputedStyle(canvas).getPropertyValue("--brand-canvas").trim() || "#eef4f3";
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
    <div className={showHeading ? "mt-6" : "mt-3"}>
      {showHeading ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Connections
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <canvas
          ref={canvasRef}
          className="h-56 w-full"
          onClick={handleClick}
          onMouseLeave={() => setHoveredIdx(null)}
          onMouseMove={handleMouseMove}
        />
      </div>
      <ul aria-label="Connected notes" className="mt-2 space-y-1">
        {neighbors.slice(0, 14).map((neighbor) => (
          <li key={neighbor.slug}>
            <button
              type="button"
              aria-label={`Open connected note ${neighbor.title}`}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:min-h-0"
              onClick={() => onClickNode(neighbor.slug)}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: miniColor(neighbor.categories, aliases) }}
              />
              <span className="truncate">{neighbor.title}</span>
            </button>
          </li>
        ))}
      </ul>
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
    const scrollRoot = getScrollRoot(scrollContainerRef);
    if (scrollRoot) {
      scrollRoot.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.scrollTo(0, 0);
  }, [page.slug, scrollContainerRef]);

  const personActionBusy = isUpdatingPerson;

  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ node, children, ...props }) => {
        void node;
        return (
          <h1
            className="mb-4 scroll-mt-20 text-3xl"
            {...props}
            id={renderedHeadingId(children, props.id)}
          >
            {children}
          </h1>
        );
      },
      h2: ({ node, children, ...props }) => {
        void node;
        return (
          <h2
            className="font-display mb-3 mt-10 scroll-mt-20 text-xl font-light"
            {...props}
            id={renderedHeadingId(children, props.id)}
          >
            {children}
          </h2>
        );
      },
      h3: ({ node, children, ...props }) => {
        void node;
        return (
          <h3
            className="font-display mb-2 mt-7 scroll-mt-20 text-lg font-light"
            {...props}
            id={renderedHeadingId(children, props.id)}
          >
            {children}
          </h3>
        );
      },
      h4: ({ node, children, ...props }) => {
        void node;
        return (
          <h4
            className="mb-2 mt-5 scroll-mt-20 text-base font-medium"
            {...props}
            id={renderedHeadingId(children, props.id)}
          >
            {children}
          </h4>
        );
      },
      p: ({ node, children, className, ...props }) => {
        void node;
        const text = markdownNodeText(children);
        if (looksLikeAsciiDiagramBlock(text)) {
          return (
            <pre className={["note-ascii-block", className].filter(Boolean).join(" ")}>
              <code>{text}</code>
            </pre>
          );
        }

        return (
          <p className={["mb-4 leading-[1.8]", className].filter(Boolean).join(" ")} {...props}>
            {children}
          </p>
        );
      },
      ul: (props) => <ul className="mb-4 list-disc pl-6 leading-[1.8]" {...props} />,
      ol: (props) => <ol className="mb-4 list-decimal pl-6 leading-[1.8]" {...props} />,
      li: (props) => <li className="mb-1.5" {...props} />,
      blockquote: (props) => <blockquote className="my-4" {...props} />,
      table: ({ node, ...props }) => {
        void node;
        return (
          <div className="note-table-scroll">
            <table {...props} />
          </div>
        );
      },
      pre: CodeBlockPre,
      a: ({ href, onClick, ...props }) => {
        const { target, download } = props;
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          if (typeof window === "undefined") return;
          routeWikiLinkClick({
            href,
            origin: window.location.origin,
            target,
            download,
            onNavigateNote: onNavigateNoteRef.current,
            event,
          });
        };

        return <a href={href} onClick={handleClick} {...props} />;
      },
    }),
    [],
  );

  const navigateToRelatedNote = useCallback(
    (href: string, event: LinkNavigationEvent) =>
      typeof window !== "undefined"
        ? routeWikiLinkClick({
            href,
            origin: window.location.origin,
            onNavigateNote,
            event,
          })
        : false,
    [onNavigateNote],
  );

  const navigateToGraphNote = useCallback(
    (slug: string) => navigateGraphNode(slug, onNavigateNote),
    [onNavigateNote],
  );

  const updatePersonOverride = useCallback(
    async (nextOverride: "person" | "not-person" | null) => {
      setIsUpdatingPerson(true);
      setPersonOverrideError(null);

      try {
        await savePersonOverride({
          fileName: page.fileName,
          override: nextOverride,
          onRefreshPage,
        });
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
                  className="inline-flex min-h-11 items-center underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70 sm:min-h-0"
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
                      className="inline-flex min-h-11 items-center underline decoration-[var(--muted-foreground)]/30 underline-offset-2 transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70 sm:min-h-0"
                    >
                      Clear override
                    </button>
                  </>
                ) : null}
                {personOverrideError ? <span className="text-[var(--brand-error)]">{personOverrideError}</span> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {filteredHeadings.length > 0 ? (
        <div
          className="note-viewer-mobile-toc mb-6 rounded-lg border border-[var(--border)] bg-[var(--brand-surface)] px-4 py-3 lg:hidden"
          data-note-viewer-mobile-toc="true"
        >
          {filteredHeadings.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                On this page
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {filteredHeadings.filter((heading) => heading.level <= 2).map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    onClick={(event) => handleTocHeadingClick(event, heading.id, scrollContainerRef)}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--foreground)] sm:min-h-0"
                  >
                    {heading.text}
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="note-viewer-layout relative max-w-3xl xl:grid xl:max-w-[calc(48rem+13rem+2rem)] xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-8">
        <div className="note-viewer-main min-w-0">
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
                      navigateToRelatedNote(link.href, event);
                    }}
                    className="inline-flex min-h-11 items-center rounded-full border border-[var(--brand-control-border)] bg-[var(--brand-surface)] px-3.5 py-1.5 text-sm transition-[color,background-color,transform] duration-150 hover:bg-[var(--brand-accent-soft)] active:scale-[0.97] sm:min-h-0"
                  >
                    <span className="font-display font-light text-[var(--foreground)]">{link.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {page.neighbors.length > 0 ? (
            <details
              className="note-viewer-mobile-connections mt-8 rounded-lg border border-[var(--border)] bg-[var(--brand-surface)] lg:hidden"
              data-note-viewer-mobile-connections="true"
            >
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                {page.neighbors.length} {page.neighbors.length === 1 ? "connection" : "connections"}
              </summary>
              <div className="border-t border-[var(--border)] px-3 pb-3">
                <NeighborhoodGraph
                  currentTitle={page.title}
                  currentCategories={page.categories}
                  neighbors={page.neighbors}
                  onClickNode={navigateToGraphNote}
                  aliases={config.categories.aliases}
                  showHeading={false}
                />
              </div>
            </details>
          ) : null}
        </div>

        <aside
          className="note-viewer-side-rail absolute -right-60 top-0 hidden w-52 xl:static xl:block xl:w-auto"
          data-note-viewer-side-rail="true"
        >
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
