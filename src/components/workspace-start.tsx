import { ArrowRight, BookOpen, FileText, Folder } from "lucide-react";
import type { ExplorerPage } from "@/lib/wiki-shared";

function noteFolder(page: ExplorerPage) {
  return page.file.split("/").slice(0, -1).join("/") || "Vault root";
}

export function WorkspaceStart({
  pages,
  recentSlugs,
  readingProgress,
  onSelect,
  onBrowseNotes,
}: {
  pages: readonly ExplorerPage[];
  recentSlugs: readonly string[];
  readingProgress: Readonly<Record<string, number>>;
  onSelect: (slug: string) => void;
  onBrowseNotes: () => void;
}) {
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  const [resume, ...recent] = [...new Set(recentSlugs)].flatMap(slug => {
    const page = bySlug.get(slug);
    return page ? [page] : [];
  }).slice(0, 6);

  if (!resume) {
    return (
      <section className="workspace-start workspace-start-empty" aria-label="Start reading">
        <BookOpen size={28} aria-hidden="true" />
        <h1>Open a note</h1>
        <button type="button" className="workspace-start-browse" onClick={onBrowseNotes}>Browse notes</button>
      </section>
    );
  }

  const progress = readingProgress[resume.slug];
  return (
    <section className="workspace-start" aria-labelledby="continue-reading-heading">
      <h1 id="continue-reading-heading">Continue reading</h1>
      <button type="button" className="workspace-resume" aria-label={`Resume reading ${resume.title}`} onClick={() => onSelect(resume.slug)}>
        <BookOpen size={27} className="workspace-resume-icon" aria-hidden="true" />
        <span className="workspace-resume-note">
          <span className="workspace-start-title" title={resume.title}>{resume.title}</span>
          <span className="workspace-start-folder" title={noteFolder(resume)}><Folder size={15} aria-hidden="true" /><span>{noteFolder(resume)}</span></span>
        </span>
        <span className="workspace-resume-action">
          {Number.isFinite(progress) && <span className="workspace-reading-progress">{progress}% read</span>}
          <span className="workspace-resume-link">Resume reading <ArrowRight size={16} aria-hidden="true" /></span>
        </span>
      </button>
      {recent.length > 0 && (
        <section className="workspace-recents" aria-labelledby="recent-notes-heading">
          <h2 id="recent-notes-heading">Recent notes</h2>
          <ul>
            {recent.map(page => (
              <li key={page.slug}>
                <button type="button" className="workspace-recent-note" data-slug={page.slug} onClick={() => onSelect(page.slug)}>
                  <FileText size={21} className="workspace-recent-icon" aria-hidden="true" />
                  <span className="workspace-start-title" title={page.title}>{page.title}</span>
                  <span className="workspace-start-folder" title={noteFolder(page)}><Folder size={15} aria-hidden="true" /><span>{noteFolder(page)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
