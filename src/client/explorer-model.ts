import type { ExplorerPage } from "../lib/wiki-shared";

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
