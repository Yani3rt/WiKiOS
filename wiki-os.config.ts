import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "WikiOS",
  tagline: "Search your notes and follow the connections between them.",
  searchPlaceholder: "Search notes, ideas, and people...",
  homepage: {
    labels: {
      featured: "Worth revisiting",
      topConnected: "Highly connected",
      people: "People",
      recentPages: "Recently updated",
    },
  },
  people: {
    mode: "explicit",
  },
};

export default config;
