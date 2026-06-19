import type { ExplorerPage } from "../lib/wiki-shared";

export interface ExplorerTab {
  slug: string;
  title: string;
  file: string;
}

export interface ExplorerWorkspace {
  tabs: readonly ExplorerTab[];
  activeSlug: string | null;
}

export const EXPLORER_STORAGE_KEY = "wiki-os:explorer-workspace";

const EXPLORER_STORAGE_VERSION = 1;

export const EMPTY_EXPLORER_WORKSPACE: ExplorerWorkspace = Object.freeze({
  tabs: Object.freeze([]) as readonly ExplorerTab[],
  activeSlug: null,
});

function emptyExplorerWorkspace(): ExplorerWorkspace {
  return { tabs: [], activeSlug: null };
}

export function openExplorerTab(
  workspace: ExplorerWorkspace,
  page: ExplorerPage | ExplorerTab,
): ExplorerWorkspace {
  if (workspace.tabs.some((tab) => tab.slug === page.slug)) {
    if (workspace.activeSlug === page.slug) return workspace;
    return { tabs: [...workspace.tabs], activeSlug: page.slug };
  }

  const tab: ExplorerTab = { slug: page.slug, title: page.title, file: page.file };
  return { tabs: [...workspace.tabs, tab], activeSlug: tab.slug };
}

export function activateExplorerTab(
  workspace: ExplorerWorkspace,
  slug: string,
): ExplorerWorkspace {
  if (workspace.activeSlug === slug || !workspace.tabs.some((tab) => tab.slug === slug)) {
    return workspace;
  }
  return { tabs: [...workspace.tabs], activeSlug: slug };
}

export function closeExplorerTab(
  workspace: ExplorerWorkspace,
  slug: string,
): ExplorerWorkspace {
  const closingIndex = workspace.tabs.findIndex((tab) => tab.slug === slug);
  if (closingIndex === -1) return workspace;

  const tabs = workspace.tabs.filter((tab) => tab.slug !== slug);
  if (workspace.activeSlug !== slug) return { tabs, activeSlug: workspace.activeSlug };
  if (tabs.length === 0) return emptyExplorerWorkspace();

  const nextActiveIndex = closingIndex > 0 ? closingIndex - 1 : 0;
  return { tabs, activeSlug: tabs[nextActiveIndex].slug };
}

export function closeOtherExplorerTabs(
  workspace: ExplorerWorkspace,
  slug: string,
): ExplorerWorkspace {
  const retainedTab = workspace.tabs.find((tab) => tab.slug === slug);
  if (!retainedTab) return workspace;
  if (workspace.tabs.length === 1 && workspace.activeSlug === slug) return workspace;
  return { tabs: [retainedTab], activeSlug: slug };
}

export function serializeExplorerWorkspace(workspace: ExplorerWorkspace): string {
  return JSON.stringify({
    version: EXPLORER_STORAGE_VERSION,
    tabs: workspace.tabs,
    activeSlug: workspace.activeSlug,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isExplorerTab(value: unknown): value is ExplorerTab {
  return (
    isRecord(value) &&
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.file)
  );
}

export function parseExplorerWorkspace(serialized: string): ExplorerWorkspace {
  let persisted: unknown;
  try {
    persisted = JSON.parse(serialized);
  } catch {
    return emptyExplorerWorkspace();
  }

  if (
    !isRecord(persisted) ||
    persisted.version !== EXPLORER_STORAGE_VERSION ||
    !Array.isArray(persisted.tabs)
  ) {
    return emptyExplorerWorkspace();
  }

  const seenSlugs = new Set<string>();
  const tabs = persisted.tabs.filter((tab): tab is ExplorerTab => {
    if (!isExplorerTab(tab) || seenSlugs.has(tab.slug)) return false;
    seenSlugs.add(tab.slug);
    return true;
  });
  if (tabs.length === 0) return emptyExplorerWorkspace();

  const activeSlug =
    isNonEmptyString(persisted.activeSlug) && seenSlugs.has(persisted.activeSlug)
      ? persisted.activeSlug
      : tabs[0].slug;
  return { tabs, activeSlug };
}

export interface ExplorerFolder {
  name: string;
  path: string;
  folders: ExplorerFolder[];
  pages: ExplorerPage[];
}

export type ExplorerTreeRow =
  | { kind: "folder"; path: string; name: string; depth: number; count: number }
  | { kind: "page"; page: ExplorerPage; depth: number };

function compareNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function sortFolder(folder: ExplorerFolder) {
  folder.folders.sort((left, right) => compareNames(left.name, right.name));
  folder.pages.sort(
    (left, right) => compareNames(left.title, right.title) || compareNames(left.file, right.file),
  );
  folder.folders.forEach(sortFolder);
}

export function buildExplorerTree(pages: ExplorerPage[]): ExplorerFolder {
  const root: ExplorerFolder = { name: "", path: "", folders: [], pages: [] };
  const folderLookups = new WeakMap<ExplorerFolder, Map<string, ExplorerFolder>>();
  folderLookups.set(root, new Map());

  for (const page of pages) {
    const parts = page.file.split("/");
    const folderNames = parts.slice(0, -1);
    let current = root;
    let currentPath = "";

    for (const name of folderNames) {
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      const folderLookup = folderLookups.get(current)!;
      let child = folderLookup.get(name);
      if (!child) {
        child = { name, path: currentPath, folders: [], pages: [] };
        current.folders.push(child);
        folderLookup.set(name, child);
        folderLookups.set(child, new Map());
      }
      current = child;
    }

    current.pages.push(page);
  }

  sortFolder(root);
  return root;
}

function collectPageCounts(
  folder: ExplorerFolder,
  pageCounts: WeakMap<ExplorerFolder, number>,
): number {
  const count =
    folder.pages.length +
    folder.folders.reduce((total, child) => total + collectPageCounts(child, pageCounts), 0);
  pageCounts.set(folder, count);
  return count;
}

export function flattenVisibleTree(
  tree: ExplorerFolder,
  expandedPaths: ReadonlySet<string>,
): ExplorerTreeRow[] {
  const rows: ExplorerTreeRow[] = [];
  const pageCounts = new WeakMap<ExplorerFolder, number>();
  collectPageCounts(tree, pageCounts);

  function visit(folder: ExplorerFolder, depth: number) {
    for (const child of folder.folders) {
      rows.push({
        kind: "folder",
        path: child.path,
        name: child.name,
        depth,
        count: pageCounts.get(child)!,
      });
      if (expandedPaths.has(child.path)) visit(child, depth + 1);
    }

    for (const page of folder.pages) rows.push({ kind: "page", page, depth });
  }

  visit(tree, 0);
  return rows;
}

export function filterExplorerPages(pages: ExplorerPage[], query: string): ExplorerPage[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...pages];

  return pages.filter((page) => {
    const title = page.title.toLocaleLowerCase();
    const pathWithoutExtension = page.file.replace(/\.[^/.]+$/u, "").toLocaleLowerCase();
    return title.includes(normalizedQuery) || pathWithoutExtension.includes(normalizedQuery);
  });
}

export function collectFolderPaths(tree: ExplorerFolder): string[] {
  const paths: string[] = [];

  function visit(folder: ExplorerFolder) {
    for (const child of folder.folders) {
      paths.push(child.path);
      visit(child);
    }
  }

  visit(tree);
  return paths;
}
