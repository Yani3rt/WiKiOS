import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Clock3, CornerDownLeft, FileText, Search, X } from "lucide-react";

import {
  getNextCommandPaletteIndex,
  resolveCommandPalettePages,
} from "@/client/command-palette-model";
import type { ExplorerPage } from "@/lib/wiki-shared";

export type CommandPaletteStatus = "idle" | "loading" | "ready" | "error";

interface CommandPaletteProps {
  readonly open: boolean;
  readonly pages: readonly ExplorerPage[];
  readonly recentSlugs: readonly string[];
  readonly status: CommandPaletteStatus;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSelect: (page: ExplorerPage) => void;
}

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function CommandPalette({
  open,
  pages,
  recentSlugs,
  status,
  onClose,
  onRetry,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () => resolveCommandPalettePages(pages, recentSlugs, query),
    [pages, query, recentSlugs],
  );
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setSelectedIndex(0);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex < results.length) return;
    setSelectedIndex(Math.max(0, results.length - 1));
  }, [results.length, selectedIndex]);

  if (!open) return null;

  const selectCurrentResult = () => {
    const page = results[selectedIndex];
    if (page) onSelect(page);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    const nextIndex = getNextCommandPaletteIndex(event.key, selectedIndex, results.length);
    if (nextIndex !== null) {
      event.preventDefault();
      setSelectedIndex(nextIndex);
      return;
    }

    if (event.key === "Enter" && results.length > 0) {
      event.preventDefault();
      selectCurrentResult();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="command-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="command-palette-search-row">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes by title or path…"
            aria-label="Search notes"
            aria-controls="command-palette-results"
            aria-activedescendant={
              results[selectedIndex] ? `command-palette-option-${selectedIndex}` : undefined
            }
          />
          <kbd aria-label="Command K">⌘K</kbd>
          <button type="button" aria-label="Close command palette" onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="command-palette-content">
          <div className="command-palette-section-heading">
            {hasQuery ? (
              <FileText aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Clock3 aria-hidden="true" className="h-4 w-4" />
            )}
            <h2>{hasQuery ? "Notes" : "Recently opened"}</h2>
          </div>

          {status === "idle" || status === "loading" ? (
            <p className="command-palette-state" role="status">
              Loading notes…
            </p>
          ) : status === "error" ? (
            <div className="command-palette-state" role="alert">
              <p>Notes are unavailable right now.</p>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : results.length === 0 ? (
            <p className="command-palette-state" role="status">
              {hasQuery ? "No notes match your search." : "No recently opened notes yet."}
            </p>
          ) : (
            <div id="command-palette-results" role="listbox" aria-label="Notes">
              {results.map((page, index) => {
                const selected = index === selectedIndex;
                return (
                  <button
                    key={page.slug}
                    id={`command-palette-option-${index}`}
                    type="button"
                    className="command-palette-result"
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setSelectedIndex(index)}
                    onClick={() => onSelect(page)}
                  >
                    <span className="command-palette-result-icon" aria-hidden="true">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="command-palette-result-copy">
                      <strong>{page.title}</strong>
                      <span>{page.file.replace(/\.md$/iu, "")}</span>
                    </span>
                    {selected ? (
                      <span className="command-palette-enter" aria-hidden="true">
                        <CornerDownLeft className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
