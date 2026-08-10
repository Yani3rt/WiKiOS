import { describe, expect, it } from "vitest";

import { getMermaidConfig } from "../src/client/mermaid-theme";

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
});
