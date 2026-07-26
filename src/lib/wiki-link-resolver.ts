export interface WikiLinkCandidate {
  file: string;
  slug: string;
  title: string;
}

export type WikiLinkResolution =
  | {
      status: "resolved";
      reason: "explicit" | "unique" | "same-folder";
      target: string;
      candidate: WikiLinkCandidate;
    }
  | {
      status: "ambiguous";
      target: string;
      candidates: WikiLinkCandidate[];
    }
  | {
      status: "missing";
      target: string;
    };

export interface WikiLinkIndex {
  candidates: readonly WikiLinkCandidate[];
  byPath: ReadonlyMap<string, readonly WikiLinkCandidate[]>;
  byBasename: ReadonlyMap<string, readonly WikiLinkCandidate[]>;
}

function normalizedPath(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function withoutMarkdownExtension(value: string) {
  return value.replace(/\.md$/iu, "");
}

function targetPath(rawTarget: string) {
  return withoutMarkdownExtension(normalizedPath(rawTarget));
}

function fileStem(file: string) {
  return withoutMarkdownExtension(normalizedPath(file));
}

function basename(value: string) {
  const parts = value.split("/");
  return parts[parts.length - 1] ?? value;
}

function dirname(value: string) {
  const parts = value.split("/");
  return parts.slice(0, -1).join("/");
}

function lookupKey(value: string) {
  return value.normalize("NFC").toLocaleLowerCase();
}

function sortedCandidates(values: readonly WikiLinkCandidate[]) {
  return [...values].sort(
    (left, right) =>
      left.file.localeCompare(right.file, undefined, { sensitivity: "base" }) ||
      left.file.localeCompare(right.file),
  );
}

function addToIndex(
  map: Map<string, WikiLinkCandidate[]>,
  key: string,
  candidate: WikiLinkCandidate,
) {
  const values = map.get(key);
  if (values) values.push(candidate);
  else map.set(key, [candidate]);
}

export function buildWikiLinkIndex(
  candidates: readonly WikiLinkCandidate[],
): WikiLinkIndex {
  const byPath = new Map<string, WikiLinkCandidate[]>();
  const byBasename = new Map<string, WikiLinkCandidate[]>();

  for (const candidate of candidates) {
    const stem = fileStem(candidate.file);
    addToIndex(byPath, lookupKey(stem), candidate);
    addToIndex(byBasename, lookupKey(basename(stem)), candidate);
  }

  return {
    candidates: sortedCandidates(candidates),
    byPath,
    byBasename,
  };
}

export function resolveWikiLinkTarget(
  rawTarget: string,
  sourceFile: string | null,
  index: WikiLinkIndex,
): WikiLinkResolution {
  const target = targetPath(rawTarget);
  const parts = target.split("/").filter(Boolean);

  if (
    !target ||
    parts.some((part) => part === "." || part === ".." || part.includes("\0"))
  ) {
    return { status: "missing", target };
  }

  if (target.includes("/")) {
    const exactCandidates = sortedCandidates(
      index.byPath.get(lookupKey(target)) ?? [],
    );
    if (exactCandidates.length === 1) {
      return {
        status: "resolved",
        reason: "explicit",
        target,
        candidate: exactCandidates[0],
      };
    }
    return exactCandidates.length > 1
      ? { status: "ambiguous", target, candidates: exactCandidates }
      : { status: "missing", target };
  }

  const basenameCandidates = sortedCandidates(
    index.byBasename.get(lookupKey(target)) ?? [],
  );
  if (basenameCandidates.length === 1) {
    return {
      status: "resolved",
      reason: "unique",
      target,
      candidate: basenameCandidates[0],
    };
  }

  if (sourceFile && basenameCandidates.length > 1) {
    const sourceFolder = dirname(fileStem(sourceFile));
    const sameFolder = basenameCandidates.filter(
      (candidate) =>
        lookupKey(dirname(fileStem(candidate.file))) === lookupKey(sourceFolder),
    );
    if (sameFolder.length === 1) {
      return {
        status: "resolved",
        reason: "same-folder",
        target,
        candidate: sameFolder[0],
      };
    }
  }

  if (basenameCandidates.length > 1) {
    return { status: "ambiguous", target, candidates: basenameCandidates };
  }

  return { status: "missing", target };
}
