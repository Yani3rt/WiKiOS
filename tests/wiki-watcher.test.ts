import { describe, expect, it, vi } from "vitest";

import {
  createWikiWatcherController,
  type WikiWatcherState,
} from "../src/lib/wiki-watcher";

function createWatcherState(): WikiWatcherState {
  return {
    periodicReconcileTimer: null,
    periodicReconcilePromise: null,
    watcher: null,
    watcherPromise: null,
    watcherDebounceTimer: null,
    watcherRestartTimer: null,
    watcherStableTimer: null,
    watcherRestartAttempts: 0,
    watcherNeedsPostRestartReconcile: false,
    suppressWatcherRestart: false,
    watcherFlushPromise: null,
    pendingPaths: new Set(),
    pendingFullReconcile: false,
  };
}

describe("wiki watcher controller", () => {
  it("treats a full scan as authoritative and processes later events in one materialized incremental batch", async () => {
    const state = createWatcherState();
    const events: string[] = [];
    state.pendingFullReconcile = true;
    state.pendingPaths.add("Captured-before-full.md");

    const syncSinglePath = vi.fn(async (relativePath: string) => {
      events.push(`sync:${relativePath}`);
      return true;
    });
    const reconcileBacklinkTargets = vi.fn(() => {
      events.push("materialize");
    });
    const controller = createWikiWatcherController({
      state,
      env: { nodeEnv: "test" },
      assertWikiRootAccessible: async () => {},
      requireWikiRoot: () => "/vault",
      ensureIndexReady: async () => {},
      reconcileIndexWithDisk: vi.fn(async () => {
        events.push("full-scan-and-materialize");
        state.pendingPaths.add("Queued-during-full.md");
        return { upserted: 1, deleted: 0 };
      }),
      syncSinglePath,
      reconcileBacklinkTargets,
      recordSyncSuccess: () => {
        events.push("success");
      },
      recordSyncError: (_source, error) => {
        throw error;
      },
      markRevisionChanged: () => {
        events.push("revision");
      },
    });

    await controller.flushPendingWatcherChanges();

    expect(syncSinglePath).not.toHaveBeenCalled();
    expect(reconcileBacklinkTargets).not.toHaveBeenCalled();
    expect(state.pendingPaths).toEqual(new Set(["Queued-during-full.md"]));
    expect(events).toEqual([
      "full-scan-and-materialize",
      "revision",
      "success",
    ]);

    await controller.drainPendingUpdates();

    expect(syncSinglePath).toHaveBeenCalledTimes(1);
    expect(syncSinglePath).toHaveBeenCalledWith("Queued-during-full.md");
    expect(reconcileBacklinkTargets).toHaveBeenCalledTimes(1);
    expect(state.pendingPaths.size).toBe(0);
    expect(events).toEqual([
      "full-scan-and-materialize",
      "revision",
      "success",
      "sync:Queued-during-full.md",
      "materialize",
      "revision",
      "success",
    ]);
  });
});
