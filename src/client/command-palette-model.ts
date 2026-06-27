import type { ExplorerPage } from "../lib/wiki-shared";

export const COMMAND_PALETTE_RECENTS_KEY = "wiki-os:command-palette-recents";
export const COMMAND_PALETTE_RECENTS_LIMIT = 3;

interface ShortcutLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

export function promoteRecentNote(recents: readonly string[], slug: string) {
  const normalized = slug.trim();
  if (!normalized) return [...recents].slice(0, COMMAND_PALETTE_RECENTS_LIMIT);

  return [normalized, ...recents.filter((item) => item !== normalized)].slice(
    0,
    COMMAND_PALETTE_RECENTS_LIMIT,
  );
}

export function serializeRecentNoteSlugs(recents: readonly string[]) {
  return JSON.stringify(recents.slice(0, COMMAND_PALETTE_RECENTS_LIMIT));
}

export function parseRecentNoteSlugs(serialized: string | null): string[] {
  if (!serialized) return [];

  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];

    const result: string[] = [];
    for (const item of value) {
      if (typeof item !== "string" || !item.trim() || result.includes(item)) continue;
      result.push(item);
      if (result.length === COMMAND_PALETTE_RECENTS_LIMIT) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function noteSlugFromPathname(pathname: string): string | null {
  const match = /^\/(?:wiki|explorer)\/(.+)$/u.exec(pathname);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function filterCommandPalettePages(pages: readonly ExplorerPage[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...pages];

  return pages.filter((page) => {
    const title = page.title.toLocaleLowerCase();
    const path = page.file.replace(/\.md$/iu, "").toLocaleLowerCase();
    return title.includes(normalized) || path.includes(normalized);
  });
}

export function resolveCommandPalettePages(
  pages: readonly ExplorerPage[],
  recentSlugs: readonly string[],
  query: string,
) {
  if (query.trim()) return filterCommandPalettePages(pages, query);

  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  return recentSlugs.flatMap((slug) => {
    const page = bySlug.get(slug);
    return page ? [page] : [];
  });
}

export function normalizeCommandPalettePages(pages: readonly ExplorerPage[]) {
  return pages.map((page) => ({
    ...page,
    slug: page.file
      .replace(/\.md$/iu, "")
      .split("/")
      .filter(Boolean)
      .join("/"),
  }));
}

export function commandPaletteExplorerPath(slug: string) {
  const encoded = slug
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return encoded ? `/explorer/${encoded}` : "/explorer";
}

export function isCommandPaletteShortcut(event: ShortcutLike) {
  return (
    event.key.toLocaleLowerCase() === "k" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey
  );
}

export function getNextCommandPaletteIndex(key: string, current: number, count: number) {
  if (count <= 0) return null;
  if (key === "ArrowDown") return (current + 1 + count) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  return null;
}
