import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeRelativePath, isIgnoredDirectoryName, shouldIndexRelativeFile } from "./wiki-file-utils";
import { parseWikiFrontmatter, prepareWikiMarkdown } from "./markdown";
import { deriveCategoryNames, detectPersonPage, extractBacklinkReferences, extractSummary } from "./wiki-classification";
import { slugFromFileName, titleFromFileName, type PersonOverrideValue, type SyncSource } from "./wiki-shared";
import { upsertPageRecord, deletePageByFile, reconcileBacklinkTargets, type IndexedWikiPageRecord, type SqliteDb } from "./wiki-db";
import type { WikiOsConfig } from "./wiki-config";

export interface ReconcileStats {
  upserted: number;
  deleted: number;
}

export interface WikiIndexerDependencies {
  syncRuntimeSettings(): Promise<unknown>;
  requireWikiRoot(): string;
  requireIndexDbPath(): string;
  requireDb(): SqliteDb;
  getWikiEnvironmentConfig(): Promise<WikiOsConfig>;
  getPersonOverride(file: string): PersonOverrideValue | null;
  markRevisionChanged?(): void;
  recordSyncSuccess?(source: SyncSource): void;
  recordSyncError?(source: SyncSource, error: unknown): void;
}

export interface ReconcileOptions {
  forceAll?: boolean;
  source?: SyncSource | null;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isMissingPathError(error: unknown) {
  return isErrnoException(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

export async function assertWikiRootAccessible(
  deps: WikiIndexerDependencies,
): Promise<void> {
  await deps.syncRuntimeSettings();
  const wikiRoot = deps.requireWikiRoot();
  const stat = await fs.stat(wikiRoot);

  if (!stat.isDirectory()) {
    throw new Error(`WIKI_ROOT is not a directory: ${wikiRoot}`);
  }
}

export async function collectMarkdownFiles(
  dir: string,
  root: string,
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isIgnoredDirectoryName(entry.name)) {
        continue;
      }

      files.push(...(await collectMarkdownFiles(fullPath, root)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = normalizeRelativePath(path.relative(root, fullPath));
    if (shouldIndexRelativeFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

export async function loadIndexedWikiPage(
  file: string,
  deps: WikiIndexerDependencies,
  modifiedAtOverride?: number,
): Promise<IndexedWikiPageRecord | null> {
  const wikiRoot = deps.requireWikiRoot();
  const filePath = path.join(wikiRoot, file);

  try {
    const [markdown, modifiedAt] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      modifiedAtOverride === undefined
        ? fs.stat(filePath).then((stat) => stat.mtimeMs)
        : Promise.resolve(modifiedAtOverride),
    ]);

    const config = await deps.getWikiEnvironmentConfig();
    const title = titleFromFileName(file);
    const titleLower = title.toLowerCase();
    const { data: frontmatter, body } = parseWikiFrontmatter(markdown);
    const prepared = prepareWikiMarkdown(body);
    const categoryNames = deriveCategoryNames(
      file,
      title,
      prepared.contentMarkdown,
      frontmatter,
      config,
    );
    const isPerson = detectPersonPage(
      file,
      title,
      prepared.contentMarkdown,
      frontmatter,
      config,
      deps.getPersonOverride(file),
    );

    return {
      file,
      slug: slugFromFileName(file),
      title,
      titleLower,
      markdown: body,
      contentMarkdown: prepared.contentMarkdown,
      contentLower: prepared.contentMarkdown.toLowerCase(),
      wordCount: prepared.contentMarkdown.split(/\s+/).filter(Boolean).length,
      backlinkReferences: extractBacklinkReferences(body),
      categoryNames,
      modifiedAt,
      summary: extractSummary(prepared.contentMarkdown),
      isPerson,
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

export async function ensureDbDirectory(
  deps: Pick<WikiIndexerDependencies, "requireIndexDbPath">,
): Promise<void> {
  await fs.mkdir(path.dirname(deps.requireIndexDbPath()), { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function hasExistingIndexArtifacts(
  deps: Pick<WikiIndexerDependencies, "requireIndexDbPath">,
): Promise<boolean> {
  const indexDbPath = deps.requireIndexDbPath();
  const paths = [indexDbPath, `${indexDbPath}-wal`, `${indexDbPath}-shm`];

  for (const filePath of paths) {
    if (await pathExists(filePath)) {
      return true;
    }
  }

  return false;
}

export async function syncSinglePath(
  relativePath: string,
  deps: WikiIndexerDependencies,
): Promise<boolean> {
  const db = deps.requireDb();
  const wikiRoot = deps.requireWikiRoot();
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return false;
  }

  if (!normalizedPath.endsWith(".md")) {
    return false;
  }

  if (!shouldIndexRelativeFile(normalizedPath)) {
    return deletePageByFile(db, normalizedPath);
  }

  const absolutePath = path.join(wikiRoot, normalizedPath);
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return deletePageByFile(db, normalizedPath);
    }

    const existingModifiedAt = (db.prepare("SELECT modified_at FROM pages WHERE file = ?").get(normalizedPath) as { modified_at: number } | undefined)?.modified_at;
    if (existingModifiedAt !== undefined && Math.abs(existingModifiedAt - stat.mtimeMs) < 0.5) {
      return false;
    }

    const page = await loadIndexedWikiPage(normalizedPath, deps, stat.mtimeMs);
    if (!page) {
      return deletePageByFile(db, normalizedPath);
    }

    upsertPageRecord(db, page);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return deletePageByFile(db, normalizedPath);
    }

    throw error;
  }
}

export async function reconcileIndexWithDisk(
  deps: WikiIndexerDependencies,
  options: ReconcileOptions = {},
): Promise<ReconcileStats> {
  const source = options.source ?? null;

  try {
    await assertWikiRootAccessible(deps);
    const wikiRoot = deps.requireWikiRoot();
    const db = deps.requireDb();
    const files = (await collectMarkdownFiles(wikiRoot, wikiRoot)).sort();
    const fileSet = new Set(files);
    const existingRows = db.prepare("SELECT file, modified_at AS modifiedAt FROM pages").all() as Array<{ file: string; modifiedAt: number }>;
    const existingMap = new Map(existingRows.map((row) => [row.file, row.modifiedAt]));

    let upserted = 0;
    let deleted = 0;

    for (const file of files) {
      const fullPath = path.join(wikiRoot, file);
      const stat = await fs.stat(fullPath);
      const modifiedAt = existingMap.get(file);
      const needsUpdate =
        options.forceAll === true ||
        modifiedAt === undefined ||
        Math.abs(modifiedAt - stat.mtimeMs) >= 0.5;

      if (!needsUpdate) {
        continue;
      }

      const page = await loadIndexedWikiPage(file, deps, stat.mtimeMs);
      if (!page) {
        continue;
      }

      upsertPageRecord(db, page);
      upserted += 1;
    }

    for (const existingFile of existingMap.keys()) {
      if (fileSet.has(existingFile)) {
        continue;
      }

      if (deletePageByFile(db, existingFile)) {
        deleted += 1;
      }
    }

    if (upserted > 0 || deleted > 0 || options.forceAll) {
      reconcileBacklinkTargets(db);
    }

    if (upserted > 0 || deleted > 0) {
      deps.markRevisionChanged?.();
    }

    if (source) {
      deps.recordSyncSuccess?.(source);
    }

    return { upserted, deleted };
  } catch (error) {
    if (source) {
      deps.recordSyncError?.(source, error);
    }

    throw error;
  }
}

export function createWikiIndexer(dependencies: WikiIndexerDependencies) {
  return {
    assertWikiRootAccessible: () => assertWikiRootAccessible(dependencies),
    ensureDbDirectory: () => ensureDbDirectory(dependencies),
    hasExistingIndexArtifacts: () => hasExistingIndexArtifacts(dependencies),
    syncSinglePath: (relativePath: string) => syncSinglePath(relativePath, dependencies),
    reconcileIndexWithDisk: (options?: ReconcileOptions) => reconcileIndexWithDisk(dependencies, options),
  };
}
