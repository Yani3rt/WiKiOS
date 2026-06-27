import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app-shell";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      {
        path: "/setup",
        lazy: () => import("./routes/setup-route"),
      },
      {
        path: "/",
        lazy: () => import("./routes/home-route"),
      },
      {
        path: "/stats",
        lazy: () => import("./routes/stats-route"),
      },
      {
        path: "/graph",
        lazy: () => import("./routes/graph-route"),
      },
      {
        path: "/explorer/*",
        lazy: () => import("./routes/explorer-route"),
      },
      {
        path: "/wiki/*",
        lazy: () => import("./routes/wiki-route"),
      },
      {
        path: "*",
        lazy: () => import("./routes/not-found-route"),
      },
    ],
  },
]);
