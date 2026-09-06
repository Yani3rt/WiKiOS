import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Clock3, FileText, Plus, RefreshCw } from "lucide-react";
import type { ActivityPage } from "@/lib/wiki-shared";

interface WorkspaceActivityProps {
  pages: ActivityPage[];
  recentSlugs: string[];
  onSelect: (slug: string) => void;
}

const tabs = [
  { label: "Newly added", icon: Plus },
  { label: "Last updated", icon: RefreshCw },
  { label: "Recently opened", icon: Clock3 },
];

function timestamp(value: number): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function WorkspaceActivity({ pages, recentSlugs, onSelect }: WorkspaceActivityProps) {
  const [selected, setSelected] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const selectTab = (index: number) => {
    if (index !== selected) setVisibleCount(100);
    setSelected(index);
  };
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ordered = useMemo(() => {
    if (selected === 2) {
      const bySlug = new Map(pages.map(page => [page.slug, page]));
      return [...new Set(recentSlugs)].flatMap(slug => {
        const page = bySlug.get(slug);
        return page ? [page] : [];
      });
    }
    return [...pages].sort((a, b) => (selected === 0 ? b.firstSeenAt - a.firstSeenAt : b.modifiedAt - a.modifiedAt) || a.title.localeCompare(b.title));
  }, [pages, recentSlugs, selected]);

  function navigateTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="workspace-activity mx-auto w-full max-w-4xl px-5 py-8 sm:px-10 sm:py-12" aria-labelledby={`${id}-heading`}>
      <header className="mb-7 flex items-center gap-3">
        <h1 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)]">Activity</h1>
      </header>
      <div className="activity-tabs mb-6 flex gap-1 overflow-x-auto border-b border-[var(--brand-border)]" role="tablist" aria-label="Activity">
        {tabs.map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            type="button"
            ref={node => { tabRefs.current[index] = node; }}
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => selectTab(index)}
            onKeyDown={event => navigateTab(event, index)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--brand-accent)] ${selected === index ? "border-[var(--brand-accent)] text-[var(--brand-accent)]" : "border-transparent text-[var(--brand-muted-ink)] hover:text-[var(--brand-ink)]"}`}
          >
            <Icon size={15} aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className="outline-offset-4 focus-visible:outline-[var(--brand-accent)]">
        {ordered.length === 0 ? (
          <p className="activity-empty py-12 text-center text-sm text-[var(--brand-muted-ink)]">{selected === 2 ? "No recently opened notes" : "No notes yet"}</p>
        ) : (
          <ul className="activity-list divide-y divide-[var(--brand-border)]">
            {ordered.slice(0, visibleCount).map(page => {
              const date = timestamp(selected === 0 ? page.firstSeenAt : page.modifiedAt);
              const directory = page.file.split("/").slice(0, -1).join("/");
              return (
                <li key={page.slug}>
                  <button type="button" data-slug={page.slug} className="activity-note group flex w-full items-center gap-3 rounded-lg px-2 py-4 text-left transition-colors hover:bg-[var(--brand-surface-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)] sm:gap-4" onClick={() => onSelect(page.slug)}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-muted-ink)]"><FileText size={17} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--brand-ink)]">{page.title}</span>
                      {directory && <span className="activity-path mt-0.5 block truncate text-xs text-[var(--brand-muted-ink)]">{directory}</span>}
                    </span>
                    {selected !== 2 && date && <time className="activity-date shrink-0 text-right text-xs text-[var(--brand-muted-ink)]" dateTime={date.toISOString()} title={date.toLocaleString()}>
                      <span className="mb-0.5 block text-[10px]">{selected === 0 ? "First seen" : "Updated"}</span>
                      {date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) })}
                    </time>}
                    <ArrowUpRight size={15} aria-hidden="true" className="hidden shrink-0 text-[var(--brand-muted-ink)] transition-colors group-hover:text-[var(--brand-accent)] sm:block" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {visibleCount < ordered.length && <button type="button" className="activity-show-more mt-5 rounded-md border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-ink)] hover:bg-[var(--brand-surface-subtle)]" onClick={() => setVisibleCount(count => count + 100)}>Show more</button>}
      </div>
    </section>
  );
}
