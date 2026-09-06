// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Component } from "../src/client/routes/wiki-route";

it.each([
  ["/wiki/Folder/Ada%20Lovelace?view=note#early-life", "/explorer/Folder/Ada%20Lovelace"],
  ["/wiki/Literal%2520Name?view=note#early-life", "/explorer/Literal%2520Name"],
])("redirects %s without decoding the path or fetching a page", async (url, pathname) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const router = createMemoryRouter([
    { path: "/wiki/*", Component },
    { path: "/explorer/*", element: <div>Workspace</div> },
  ], { initialEntries: [url] });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(router.state.location).toMatchObject({ pathname, search: "?view=note", hash: "#early-life" });
    expect(router.state.historyAction).toBe("REPLACE");
    expect(container.textContent).toBe("Workspace");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    vi.unstubAllGlobals();
  }
});
