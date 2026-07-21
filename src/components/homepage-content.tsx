import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import { usePersonImage } from "@/client/use-person-image";
import { type HomepageSectionKey } from "@/lib/wiki-config";
import { type HomepageData, type PageSummary } from "@/lib/wiki-shared";

export const HOME_SECTION_PREVIEW_LIMIT = 4;

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
          <span className="mt-1 line-clamp-2 block text-sm leading-5 text-[var(--home-muted)]">
            {page.summary}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 pt-0.5 text-xs tabular-nums text-[var(--home-muted)]">
        {page.backlinkCount.toLocaleString()} {page.backlinkCount === 1 ? "backlink" : "backlinks"}
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
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-medium text-[var(--home-ink)] group-hover:text-[var(--home-accent)]">
          {person.title}
        </span>
        <span className="block text-xs text-[var(--home-muted)]">
          {person.backlinkCount.toLocaleString()} {person.backlinkCount === 1 ? "backlink" : "backlinks"}
        </span>
      </span>
    </Link>
  );
}

function HomeSection({
  sectionKey,
  title,
  description,
  itemCount,
  expanded,
  onToggle,
  children,
}: {
  sectionKey: HomepageSectionKey;
  title: string;
  description: string;
  itemCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const headingId = `home-${sectionKey}-heading`;
  const hasMore = itemCount > HOME_SECTION_PREVIEW_LIMIT;

  return (
    <section aria-labelledby={headingId} className="border-t-2 border-[var(--home-accent)] pt-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-lg font-semibold leading-6 tracking-[-0.01em] text-[var(--home-accent)]"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--home-muted)]">{description}</p>
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
      <ul id={`home-${sectionKey}-list`} className="divide-y divide-[var(--home-border)]">
        {children}
      </ul>
    </section>
  );
}

export function getVisibleHomePages<T>(pages: readonly T[], expanded: boolean) {
  return expanded ? pages : pages.slice(0, HOME_SECTION_PREVIEW_LIMIT);
}

export function HomepageContent({ homepage }: { homepage: HomepageData }) {
  const config = useWikiConfig();
  const labels = config.homepage.labels;
  const [expandedSections, setExpandedSections] = useState<Set<HomepageSectionKey>>(new Set());
  const orderedSections = config.homepage.sectionOrder.filter((section): section is HomepageSectionKey => {
    return section !== "people" || homepage.people.length > 0;
  });
  const midpoint = Math.ceil(orderedSections.length / 2);
  const columns = [orderedSections.slice(0, midpoint), orderedSections.slice(midpoint)];

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
    featured: homepage.featured.length > 0 ? (
      <HomeSection
        sectionKey="featured"
        title={labels.featured}
        description="Connected notes worth another look."
        itemCount={homepage.featured.length}
        expanded={isExpanded("featured")}
        onToggle={() => toggleSection("featured")}
      >
        {getVisibleHomePages(homepage.featured, isExpanded("featured")).map((page) => (
          <li key={page.file}>
            <PageRow page={page} showSummary />
          </li>
        ))}
      </HomeSection>
    ) : null,
    topConnected: (
      <HomeSection
        sectionKey="topConnected"
        title={labels.topConnected}
        description="Notes referenced most often across your vault."
        itemCount={homepage.topConnected.length}
        expanded={isExpanded("topConnected")}
        onToggle={() => toggleSection("topConnected")}
      >
        {getVisibleHomePages(homepage.topConnected, isExpanded("topConnected")).map((page) => (
          <li key={page.file}>
            <PageRow page={page} />
          </li>
        ))}
      </HomeSection>
    ),
    people: homepage.people.length > 0 ? (
      <HomeSection
        sectionKey="people"
        title={labels.people}
        description="People with dedicated notes in your vault."
        itemCount={homepage.people.length}
        expanded={isExpanded("people")}
        onToggle={() => toggleSection("people")}
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
