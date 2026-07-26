import type { WikiLinkCandidate } from "@/lib/wiki-link-resolver";

export function WikilinkAmbiguityView({
  target,
  candidates,
  onSelect,
  onBrowseNotes,
}: {
  target: string;
  candidates: WikiLinkCandidate[];
  onSelect: (candidate: WikiLinkCandidate) => void;
  onBrowseNotes: () => void;
}) {
  return (
    <section
      aria-labelledby="wikilink-ambiguity-title"
      className="mx-auto w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <h1 id="wikilink-ambiguity-title" className="text-2xl font-semibold">
        Which note did you mean?
      </h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Multiple notes share the name “{target}”. Choose a folder to continue.
      </p>
      <ul className="mt-5 space-y-2">
        {candidates.map((candidate) => (
          <li key={candidate.file}>
            <button
              type="button"
              className="min-h-11 w-full rounded-lg border border-[var(--border)] px-4 py-3 text-left"
              onClick={() => onSelect(candidate)}
            >
              <span className="block font-medium">{candidate.title}</span>
              <span className="block text-sm text-[var(--muted-foreground)]">
                {candidate.file}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-5 min-h-11 px-4 py-2 text-sm font-medium"
        onClick={onBrowseNotes}
      >
        Browse notes
      </button>
    </section>
  );
}
