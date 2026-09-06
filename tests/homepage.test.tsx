import { expect, it } from "vitest";
import { selectFeaturedPages } from "../src/lib/wiki-queries";
import type { PageSummary } from "../src/lib/wiki-shared";

function page(index: number): PageSummary {
  return {
    file: `Note ${index}.md`,
    slug: `Note%20${index}`,
    title: `Note ${index}`,
    summary: `Summary for note ${index}`,
    backlinkCount: index,
    wordCount: 100 + index,
    modifiedAt: index,
  };
}

  it("selects stable featured notes outside recent and connected lists when possible", () => {
    const pages = Array.from({ length: 12 }, (_, index) => page(index + 1));
    const recent = pages.slice(0, 4);
    const connected = pages.slice(4, 8);

    expect(selectFeaturedPages(pages, recent, connected).map((item) => item.file)).toEqual([
      "Note 12.md",
      "Note 11.md",
      "Note 10.md",
      "Note 9.md",
    ]);
    expect(selectFeaturedPages(pages, recent, connected)).toEqual(
      selectFeaturedPages(pages, recent, connected),
    );
  });
