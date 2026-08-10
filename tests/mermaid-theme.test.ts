import { describe, expect, it, vi } from "vitest";

const mermaidRender = vi.hoisted(() => vi.fn());
const mermaidInitialize = vi.hoisted(() => vi.fn());

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender,
  },
}));

import {
  createLatestMermaidRenderGuard,
  getMermaidConfig,
  renderMermaidDiagram,
} from "../src/client/mermaid-theme";

const colors = {
  background: "#142426",
  primary: "#27474b",
  primaryText: "#edf7f7",
  primaryBorder: "#52767a",
  line: "#698f92",
  secondary: "#273c3f",
  tertiary: "#203235",
};

describe("Mermaid appearance", () => {
  it("builds a strict base-theme config from active tokens", () => {
    expect(getMermaidConfig("dark", colors)).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      darkMode: true,
      themeVariables: {
        background: "#142426",
        primaryColor: "#27474b",
        primaryTextColor: "#edf7f7",
        primaryBorderColor: "#52767a",
        lineColor: "#698f92",
        secondaryColor: "#273c3f",
        tertiaryColor: "#203235",
      },
    });
  });

  it("continues the serialized queue after a render rejection", async () => {
    mermaidRender
      .mockRejectedValueOnce(new Error("invalid first diagram"))
      .mockResolvedValueOnce({ svg: "<svg>new</svg>" });

    await expect(renderMermaidDiagram("bad", "first", "dark", colors)).rejects.toThrow(
      "invalid first diagram",
    );
    await expect(renderMermaidDiagram("good", "second", "light", colors)).resolves.toEqual({
      svg: "<svg>new</svg>",
    });

    expect(mermaidRender).toHaveBeenNthCalledWith(1, "note-mermaid-first", "bad");
    expect(mermaidRender).toHaveBeenNthCalledWith(2, "note-mermaid-second", "good");
  });

  it("allows only the newest delayed render to commit", async () => {
    const guard = createLatestMermaidRenderGuard();
    const firstIsLatest = guard.begin();
    let releaseFirst: ((value: string) => void) | undefined;
    const firstRender = new Promise<string>((resolve) => {
      releaseFirst = resolve;
    }).then((svg) => {
      if (firstIsLatest()) committed.push(svg);
    });

    const secondIsLatest = guard.begin();
    const committed: string[] = [];
    const secondRender = Promise.resolve("new svg").then((svg) => {
      if (secondIsLatest()) committed.push(svg);
    });

    await secondRender;
    releaseFirst?.("old svg");
    await firstRender;

    expect(committed).toEqual(["new svg"]);
  });
});
