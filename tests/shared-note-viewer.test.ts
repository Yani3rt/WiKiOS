import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("shared note viewer extraction contract", () => {
  it("exports NoteViewer with the required props and route integration", async () => {
    const viewerPath = fileURLToPath(
      new URL("../src/components/note-viewer.tsx", import.meta.url),
    );
    const routePath = fileURLToPath(
      new URL("../src/client/routes/wiki-route.tsx", import.meta.url),
    );

    expect(existsSync(viewerPath)).toBe(true);

    const viewerSource = readFileSync(viewerPath, "utf8");
    const routeSource = readFileSync(routePath, "utf8");
    const viewerModule = (await import("../src/components/note-viewer")) as unknown as {
      NoteViewer?: unknown;
    };

    expect(viewerModule.NoteViewer).toBeTypeOf("function");
    expect(viewerSource).toContain("export function NoteViewer");
    expect(viewerSource).toContain("page: WikiPageData");
    expect(viewerSource).toContain("onNavigateNote: (slug: string) => void");
    expect(viewerSource).toContain("onRefreshPage?: () => void | Promise<void>");
    expect(viewerSource).toContain("scrollContainerRef?: RefObject<HTMLElement | null>");
    expect(viewerSource).toContain("TableOfContents");
    expect(viewerSource).toContain("NeighborhoodGraph");
    expect(viewerSource).toContain("Related Concepts");
    expect(viewerSource).toContain("Mark as person");
    expect(viewerSource).toContain("ReactMarkdown");

    expect(routeSource).toContain('from "@/components/note-viewer"');
    expect(routeSource).toContain("<NoteViewer");
  });
});
