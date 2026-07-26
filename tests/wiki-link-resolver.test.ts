import { describe, expect, it } from "vitest";

import {
  buildWikiLinkIndex,
  resolveWikiLinkTarget,
  type WikiLinkCandidate,
} from "../src/lib/wiki-link-resolver";

const candidates: WikiLinkCandidate[] = [
  { file: "00 Ideas/Ideas.md", slug: "00%20Ideas/Ideas", title: "Ideas" },
  { file: "Projects/Note.md", slug: "Projects/Note", title: "Note" },
  { file: "Archive/Note.md", slug: "Archive/Note", title: "Note" },
  { file: "Projects/Plan.md", slug: "Projects/Plan", title: "Plan" },
];

describe("wiki link resolver", () => {
  const index = buildWikiLinkIndex(candidates);

  it("resolves an explicit vault-relative path exactly", () => {
    expect(resolveWikiLinkTarget("Archive/Note", "Projects/Plan.md", index)).toEqual({
      status: "resolved",
      reason: "explicit",
      target: "Archive/Note",
      candidate: candidates[2],
    });
  });

  it("resolves a globally unique basename in a nested folder", () => {
    expect(resolveWikiLinkTarget("Ideas", "Home.md", index)).toEqual({
      status: "resolved",
      reason: "unique",
      target: "Ideas",
      candidate: candidates[0],
    });
  });

  it("prefers the same-folder candidate among duplicate basenames", () => {
    expect(resolveWikiLinkTarget("Note.md", "Projects/Plan.md", index)).toEqual({
      status: "resolved",
      reason: "same-folder",
      target: "Note",
      candidate: candidates[1],
    });
  });

  it("returns complete sorted candidates when duplicates remain", () => {
    expect(resolveWikiLinkTarget("Note", "Home.md", index)).toEqual({
      status: "ambiguous",
      target: "Note",
      candidates: [candidates[2], candidates[1]],
    });
  });

  it("does not basename-fallback an explicit missing path", () => {
    expect(resolveWikiLinkTarget("Missing/Note", "Home.md", index)).toEqual({
      status: "missing",
      target: "Missing/Note",
    });
  });

  it("normalizes separators and rejects parent traversal", () => {
    expect(resolveWikiLinkTarget("00 Ideas\\\\Ideas.md", "Home.md", index).status).toBe(
      "resolved",
    );
    expect(resolveWikiLinkTarget("../Ideas", "Home.md", index)).toEqual({
      status: "missing",
      target: "../Ideas",
    });
  });
});
