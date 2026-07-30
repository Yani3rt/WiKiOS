import { useState, type ReactNode } from "react";
import { ChevronRight, Eye, FileClock, Users, Waypoints } from "lucide-react";
import { Link } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import { usePersonImage } from "@/client/use-person-image";
import { type HomepageSectionKey } from "@/lib/wiki-config";
import {
  slugFromFileName,
  type ExplorerPage,
  type HomepageData,
  type PageSummary,
} from "@/lib/wiki-shared";

export const HOME_SECTION_PREVIEW_LIMIT = 4;

export function getHomeSummaryPreview(summary: string, maximumLength = 30) {
  if (summary.length <= maximumLength) return summary;
  return `${summary.slice(0, maximumLength)}...`;
}

function PageRow({ page, showSummary = false }: { page: PageSummary; showSummary?: boolean }) {
  return (
    <Link
      to={`/wiki/${page.slug}`}
      className="home-note-link group flex min-h-14 min-w-0 items-start justify-between gap-4 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
          {page.title}
        </span>
        {showSummary && page.summary ? (
          <span
            title={page.summary}
            data-home-summary-preview="true"
            className="mt-1 flex min-w-0 items-center gap-1 text-sm leading-5 text-[var(--home-muted)]"
          >
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[var(--home-accent)]"
            />
            <span className="min-w-0 truncate">{getHomeSummaryPreview(page.summary)}</span>
          </span>
        ) : null}
      </span>
      <span className="shrink-0 pt-0.5 text-xs tabular-nums text-[var(--home-muted)]">
        {page.backlinkCount.toLocaleString()} {page.backlinkCount === 1 ? "backlink" : "backlinks"}
      </span>
    </Link>
  );
}

export function getBacklinkProgressPercentage(
  backlinkCount: number,
  maximumBacklinkCount: number,
) {
  if (maximumBacklinkCount <= 0) return 0;
  return Math.min(100, Math.max(0, (backlinkCount / maximumBacklinkCount) * 100));
}

function ConnectedPageRow({
  page,
  maximumBacklinkCount,
}: {
  page: PageSummary;
  maximumBacklinkCount: number;
}) {
  const percentage = getBacklinkProgressPercentage(
    page.backlinkCount,
    maximumBacklinkCount,
  );

  return (
    <Link
      to={`/wiki/${page.slug}`}
      data-home-connected-row="true"
      className="home-note-link group flex min-h-14 min-w-0 flex-col justify-center gap-2 py-3 text-left"
    >
      <span className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
          {page.title}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--home-accent-soft)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--home-accent)]">
          {page.backlinkCount.toLocaleString()}{" "}
          {page.backlinkCount === 1 ? "backlink" : "backlinks"}
        </span>
      </span>
      <span
        aria-hidden="true"
        data-home-backlink-progress="true"
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--home-border)]"
      >
        <span
          className="block h-full rounded-full bg-[var(--home-accent)]"
          style={{ width: `${percentage}%` }}
        />
      </span>
    </Link>
  );
}

function RecentlyVisitedRow({ page }: { page: ExplorerPage }) {
  const path = page.file.replace(/\.md$/iu, "");

  return (
    <Link
      to={`/wiki/${slugFromFileName(page.file)}`}
      className="home-note-link group flex min-h-14 min-w-0 items-start py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
          {page.title}
        </span>
        <span className="mt-1 block truncate text-sm leading-5 text-[var(--home-muted)]">
          {path}
        </span>
      </span>
    </Link>
  );
}

function PersonRow({ person }: { person: PageSummary }) {
  const imageUrl = usePersonImage(person.title);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <Link
      to={`/wiki/${person.slug}`}
      data-home-person-row="true"
      className="home-note-link group flex min-h-14 min-w-0 items-center gap-3 py-2.5 text-left"
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--home-accent-soft)] text-sm font-semibold text-[var(--home-accent)]">
        <span aria-hidden={imageUrl !== null && imgLoaded}>{person.title.charAt(0)}</span>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 motion-reduce:transition-none ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
        {person.title}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          data-home-person-backlink-pill="true"
          className="shrink-0 rounded-full bg-[var(--home-accent-soft)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--home-accent)]"
        >
          {person.backlinkCount.toLocaleString()} {person.backlinkCount === 1 ? "backlink" : "backlinks"}
        </span>
        <ChevronRight
          aria-hidden="true"
          data-home-person-chevron="true"
          className="h-4 w-4 shrink-0 text-[var(--home-accent)]"
        />
      </span>
    </Link>
  );
}

function HomeSection({
  sectionKey,
  icon,
  title,
  description,
  itemCount,
  expanded,
  onToggle,
  showDividers = true,
  children,
}: {
  sectionKey: HomepageSectionKey;
  icon: ReactNode;
  title: string;
  description: string;
  itemCount: number;
  expanded: boolean;
  onToggle: () => void;
  showDividers?: boolean;
  children: ReactNode;
}) {
  const headingId = `home-${sectionKey}-heading`;
  const hasMore = itemCount > HOME_SECTION_PREVIEW_LIMIT;

  return (
    <section aria-labelledby={headingId}>
      <div
        data-home-section-header="true"
        className="mb-3 flex items-center justify-between gap-4 border-b-2 border-[var(--home-accent)] pb-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            data-home-section-icon-tile="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--home-accent-soft)] text-[var(--home-accent)]"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2
              id={headingId}
              className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-[var(--home-accent)]"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-[var(--home-muted)]">{description}</p>
          </div>
        </div>
        {hasMore ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`home-${sectionKey}-list`}
            className="min-h-11 shrink-0 rounded-md px-2 text-sm font-medium text-[var(--home-accent)] hover:bg-[var(--home-accent-soft)]"
          >
            {expanded ? "Show less" : `Show all ${itemCount}`}
          </button>
        ) : null}
      </div>
      <ul
        id={`home-${sectionKey}-list`}
        className={showDividers ? "divide-y divide-[var(--home-border)]" : ""}
      >
        {children}
      </ul>
    </section>
  );
}

export function getVisibleHomePages<T>(pages: readonly T[], expanded: boolean) {
  return expanded ? pages : pages.slice(0, HOME_SECTION_PREVIEW_LIMIT);
}

export function HomepageContent({
  homepage,
  recentlyVisitedPages,
}: {
  homepage: HomepageData;
  recentlyVisitedPages: readonly ExplorerPage[];
}) {
  const config = useWikiConfig();
  const labels = config.homepage.labels;
  const [expandedSections, setExpandedSections] = useState<Set<HomepageSectionKey>>(new Set());
  const orderedSections = config.homepage.sectionOrder.filter((section): section is HomepageSectionKey => {
    return section !== "people" || homepage.people.length > 0;
  });
  const midpoint = Math.ceil(orderedSections.length / 2);
  const columns = [orderedSections.slice(0, midpoint), orderedSections.slice(midpoint)];
  const maximumBacklinkCount = Math.max(
    0,
    ...homepage.topConnected.map((page) => page.backlinkCount),
  );

  const isExpanded = (section: HomepageSectionKey) => expandedSections.has(section);
  const toggleSection = (section: HomepageSectionKey) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const sectionViews: Record<HomepageSectionKey, ReactNode> = {
    featured: (
      <HomeSection
        sectionKey="featured"
        icon={
          <Eye aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--home-accent)]" />
        }
        title={labels.featured}
        description="Notes you opened most recently on this device."
        itemCount={recentlyVisitedPages.length}
        expanded={isExpanded("featured")}
        onToggle={() => toggleSection("featured")}
      >
        {recentlyVisitedPages.length > 0 ? (
          getVisibleHomePages(recentlyVisitedPages, isExpanded("featured")).map((page) => (
            <li key={page.file}>
              <RecentlyVisitedRow page={page} />
            </li>
          ))
        ) : (
          <li className="py-4 text-sm leading-6 text-[var(--home-muted)]">
            Open a note to start your recent history.
          </li>
        )}
      </HomeSection>
    ),
    topConnected: (
      <HomeSection
        sectionKey="topConnected"
        icon={
          <Waypoints aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--home-accent)]" />
        }
        title={labels.topConnected}
        description="Notes referenced most often across your vault."
        itemCount={homepage.topConnected.length}
        expanded={isExpanded("topConnected")}
        onToggle={() => toggleSection("topConnected")}
        showDividers={false}
      >
        {getVisibleHomePages(homepage.topConnected, isExpanded("topConnected")).map((page) => (
          <li key={page.file}>
            <ConnectedPageRow page={page} maximumBacklinkCount={maximumBacklinkCount} />
          </li>
        ))}
      </HomeSection>
    ),
    people: homepage.people.length > 0 ? (
      <HomeSection
        sectionKey="people"
        icon={
          <Users aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--home-accent)]" />
        }
        title={labels.people}
        description="People with dedicated notes in your vault."
        itemCount={homepage.people.length}
        expanded={isExpanded("people")}
        onToggle={() => toggleSection("people")}
        showDividers={false}
      >
        {getVisibleHomePages(homepage.people, isExpanded("people")).map((person) => (
          <li key={person.file}>
            <PersonRow person={person} />
          </li>
        ))}
      </HomeSection>
    ) : null,
    recentPages: (
      <HomeSection
        sectionKey="recentPages"
        icon={
          <FileClock aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--home-accent)]" />
        }
        title={labels.recentPages}
        description="Notes changed most recently."
        itemCount={homepage.recentPages.length}
        expanded={isExpanded("recentPages")}
        onToggle={() => toggleSection("recentPages")}
      >
        {getVisibleHomePages(homepage.recentPages, isExpanded("recentPages")).map((page) => (
          <li key={page.file}>
            <PageRow page={page} showSummary />
          </li>
        ))}
      </HomeSection>
    ),
  };

  return (
    <div className="w-full pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-12 sm:pt-18">
      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
        {columns.map((column, index) => (
          <div key={index} className="space-y-10">
            {column.map((section) => (
              <div key={section}>{sectionViews[section]}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
