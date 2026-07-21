import {
  ArrowRight,
  ChartNoAxesCombined,
  Folder,
  FolderX,
  House,
  LoaderCircle,
  Network,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import { ThemeSelector } from "@/components/theme-selector";

import { fetchJson } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

interface RecentVault {
  name: string;
  path: string;
  available: boolean;
}

interface SetupStatus {
  configured: boolean;
  wikiRoot: string | null;
  wikiRootSource: "env" | "saved" | "none";
  hasEnvOverride: boolean;
  sampleVaultPath: string | null;
  recentVaults: RecentVault[];
  folderPickerAvailable: boolean;
  configError: {
    code: "INVALID_JSON" | "INVALID_CONFIG" | "INVALID_WIKI_ROOT";
    message: string;
    path: string;
  } | null;
}

interface SetupLoaderData extends SetupStatus {
  mode: "setup" | "change";
}

type SetupError = {
  message: string;
  source: "path" | "picker" | "recent" | "sample";
};

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const mode = requestUrl.searchParams.get("change") === "1" ? "change" : "setup";
  const status = await fetchJson<SetupStatus>("/api/setup/status");

  if (status.configured && mode !== "change" && status.configError === null) {
    throw redirect("/");
  }

  return {
    ...status,
    mode,
  } satisfies SetupLoaderData;
}

function requestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return "We couldn’t reach WikiOS. Check that the server is running, then try again.";
  }

  return error instanceof Error ? error.message : fallback;
}

export function Component() {
  const config = useWikiConfig();
  const setupStatus = useLoaderData() as SetupLoaderData;
  const navigate = useNavigate();
  const [wikiRoot, setWikiRoot] = useState(setupStatus.wikiRoot ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [pendingVaultPath, setPendingVaultPath] = useState<string | null>(null);
  const [error, setError] = useState<SetupError | null>(null);
  const isChangeMode = setupStatus.mode === "change";
  const recentVaults = setupStatus.recentVaults.filter(
    (vault) => vault.path !== setupStatus.wikiRoot,
  );
  const isBusy = isSaving || isPickingFolder;
  const requiresCorruptReset =
    setupStatus.configError !== null && setupStatus.configError.code !== "INVALID_WIKI_ROOT";
  const issueTitle =
    setupStatus.configError?.code === "INVALID_WIKI_ROOT"
      ? setupStatus.hasEnvOverride
        ? "This vault folder isn’t available for this session."
        : "WikiOS can’t find your saved vault."
      : "Your local settings need attention.";
  const primaryActionLabel = setupStatus.configError
    ? isSaving
      ? "Opening vault…"
      : setupStatus.configError.code === "INVALID_WIKI_ROOT"
        ? "Reconnect vault"
        : "Repair settings and open vault"
    : isSaving
      ? "Opening vault…"
      : isChangeMode
        ? "Open vault"
        : "Connect vault";

  async function submitSetup(
    body: {
      wikiRoot?: string;
      useSampleVault?: boolean;
      resetCorruptConfig?: boolean;
    },
    source: SetupError["source"],
  ) {
    const requestedPath = body.wikiRoot?.trim();
    if (body.wikiRoot !== undefined && !requestedPath) {
      setError({
        message: "Enter a vault folder path to continue.",
        source: "path",
      });
      return;
    }

    setIsSaving(true);
    setPendingVaultPath(requestedPath ?? null);
    setError(null);

    try {
      const response = await fetch("/api/setup/config", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ ...body, wikiRoot: requestedPath }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "WikiOS couldn’t open that vault. Try again.");
      }

      navigate("/", { replace: true });
    } catch (setupError) {
      setError({
        message: requestErrorMessage(
          setupError,
          "WikiOS couldn’t open that vault. Your previous vault is still active.",
        ),
        source,
      });
    } finally {
      setIsSaving(false);
      setPendingVaultPath(null);
    }
  }

  async function pickFolder() {
    setIsPickingFolder(true);
    setError(null);

    try {
      const response = await fetch("/api/setup/pick-folder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          currentPath: wikiRoot || setupStatus.wikiRoot || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; cancelled?: boolean; wikiRoot?: string | null }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Finder couldn’t open.");
      }

      if (!payload?.cancelled && payload?.wikiRoot) {
        setWikiRoot(payload.wikiRoot);
      }
    } catch (pickerError) {
      setError({
        message: requestErrorMessage(
          pickerError,
          "Finder couldn’t open. Enter the vault folder path instead.",
        ),
        source: "picker",
      });
    } finally {
      setIsPickingFolder(false);
    }
  }

  const formError = error?.source === "path" || error?.source === "picker" ? error : null;
  const alternateActionError = error && !formError ? error : null;

  return (
    <div className="app-route-shell relative min-h-screen overflow-x-clip">
      <header className="app-route-header relative flex h-16 items-center justify-between px-4 md:px-5">
        <Link
          to="/"
          aria-label="Back to wiki home"
          className="app-route-header-brand rounded-md px-1 py-1 text-left"
        >
          <p className="app-route-header-meta text-xs font-medium">
            {config.siteTitle}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <House className="app-route-header-meta h-4 w-4" />
            <h1 className="text-base font-semibold">
              <span className="sm:hidden">Vault</span>
              <span className="hidden sm:inline">
                {isChangeMode ? "Vault Settings" : "Vault Setup"}
              </span>
            </h1>
          </div>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-1.5 sm:gap-2.5">
          <Link
            to="/graph"
            aria-label={config.navigation.graphLabel}
            className="app-route-header-control inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 py-2 text-sm font-medium active:scale-[0.96] sm:px-4"
          >
            <Network aria-hidden="true" className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{config.navigation.graphLabel}</span>
          </Link>
          <Link
            to="/stats"
            aria-label={config.navigation.statsLabel}
            className="app-route-header-control inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 py-2 text-sm font-medium active:scale-[0.96] sm:px-4"
          >
            <ChartNoAxesCombined aria-hidden="true" className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{config.navigation.statsLabel}</span>
          </Link>
          <ThemeSelector />
        </nav>
      </header>

      <main className="relative flex flex-1 justify-center px-4 py-12 sm:px-6 sm:py-20">
        <div className="w-full max-w-lg space-y-7">
          <div className="space-y-2">
            <h1 className="font-display text-4xl leading-tight tracking-[-0.03em] text-[var(--foreground)] sm:text-5xl">
              {isChangeMode ? "Choose your vault" : "Connect your vault"}
            </h1>
            <p className="max-w-[62ch] text-pretty text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
              {isChangeMode
                ? "Open a recent vault or choose another folder. WikiOS remembers up to eight vaults on this device."
                : "Choose the folder that contains your Obsidian notes. WikiOS stores its path only on this device."}
            </p>
          </div>

          {(setupStatus.configured || setupStatus.wikiRoot) && (
            <section aria-labelledby="current-vault-heading" className="min-w-0">
              <h2
                id="current-vault-heading"
                className="text-sm font-semibold text-[var(--foreground)]"
              >
                {setupStatus.configured ? "Current vault" : "Last vault folder"}
              </h2>
              <p
                className="mt-1 break-words font-mono text-xs leading-relaxed text-[var(--muted-foreground)]"
                dir="auto"
              >
                {setupStatus.wikiRoot}
              </p>
            </section>
          )}

          {setupStatus.hasEnvOverride && (
            <div
              role="status"
              className="rounded-xl bg-[var(--brand-accent-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--foreground)]"
            >
              <p className="font-semibold">Vault changes are locked for this session.</p>
              <p className="mt-1">
                WikiOS started with <code>WIKIOS_FORCE_WIKI_ROOT</code>. Restart it without that
                setting to choose another vault.
              </p>
            </div>
          )}

          {setupStatus.configError && (
            <div
              role="alert"
              className="rounded-xl bg-[var(--brand-error-soft)] px-4 py-3 text-sm text-[var(--brand-error)]"
            >
              <p className="font-semibold">{issueTitle}</p>
              <p className="mt-1 leading-relaxed">{setupStatus.configError.message}</p>
              <p
                className="mt-2 break-words font-mono text-xs leading-relaxed text-[var(--muted-foreground)]"
                dir="auto"
              >
                {setupStatus.configError.path}
              </p>
            </div>
          )}

          {isChangeMode && (
            <section aria-labelledby="recent-vaults-heading">
              <div>
                <h2
                  id="recent-vaults-heading"
                  className="text-lg font-semibold text-[var(--foreground)]"
                >
                  Recent vaults
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  Vaults you open successfully appear here for next time.
                </p>
              </div>

              {recentVaults.length > 0 ? (
                <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {recentVaults.map((vault) => {
                    const isPending = isSaving && pendingVaultPath === vault.path;

                    return (
                      <li key={vault.path} className="min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            void submitSetup(
                              {
                                wikiRoot: vault.path,
                                resetCorruptConfig: requiresCorruptReset,
                              },
                              "recent",
                            )
                          }
                          disabled={isBusy || setupStatus.hasEnvOverride || !vault.available}
                          aria-label={
                            vault.available
                              ? `Open recent vault ${vault.name}`
                              : `${vault.name} is unavailable because its folder could not be found`
                          }
                          className="group flex w-full min-w-0 items-center gap-3 py-3 text-start transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]">
                            {vault.available ? (
                              <Folder aria-hidden className="size-4" />
                            ) : (
                              <FolderX aria-hidden className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold text-[var(--foreground)]">
                              {vault.name}
                            </span>
                            <span
                              className="mt-0.5 block truncate font-mono text-xs text-[var(--muted-foreground)]"
                              dir="auto"
                              title={vault.path}
                            >
                              {vault.path}
                            </span>
                          </span>
                          <span
                            aria-live="polite"
                            className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]"
                          >
                            {isPending ? (
                              <>
                                <LoaderCircle
                                  aria-hidden
                                  className="size-4 animate-spin motion-reduce:animate-none"
                                />
                                Opening…
                              </>
                            ) : vault.available ? (
                              <ArrowRight
                                aria-hidden
                                className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                              />
                            ) : (
                              "Folder not found"
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl bg-[var(--muted)] px-4 py-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  No other vaults yet. Open another folder and it will appear here next time.
                </p>
              )}
            </section>
          )}

          {alternateActionError && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--brand-error-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--brand-error)]"
            >
              {alternateActionError.message}
            </p>
          )}

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSetup(
                {
                  wikiRoot,
                  resetCorruptConfig: requiresCorruptReset,
                },
                "path",
              );
            }}
          >
            <div>
              <label
                htmlFor="vault-folder-path"
                className="block text-lg font-semibold text-[var(--foreground)]"
              >
                {isChangeMode ? "Open another vault" : "Vault folder path"}
              </label>
              <p
                id="vault-folder-hint"
                className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]"
              >
                Enter a folder path this WikiOS server can access.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  id="vault-folder-path"
                  name="wikiRoot"
                  type="text"
                  value={wikiRoot}
                  onChange={(event) => {
                    setWikiRoot(event.target.value);
                    if (error?.source === "path") setError(null);
                  }}
                  placeholder="/Users/you/Documents/My Vault"
                  aria-describedby={`vault-folder-hint${formError ? " vault-folder-error" : ""}`}
                  aria-invalid={error?.source === "path" || undefined}
                  disabled={isBusy || setupStatus.hasEnvOverride}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="surface min-h-11 min-w-0 flex-1 rounded-xl px-4 py-2.5 text-[0.9rem] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                />
                {setupStatus.folderPickerAvailable && (
                  <button
                    type="button"
                    onClick={() => void pickFolder()}
                    disabled={isBusy || setupStatus.hasEnvOverride}
                    className="app-secondary-action min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isPickingFolder ? "Opening Finder…" : "Choose folder"}
                  </button>
                )}
              </div>
              {formError && (
                <p
                  id="vault-folder-error"
                  role="alert"
                  className="mt-2 rounded-xl bg-[var(--brand-error-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--brand-error)]"
                >
                  {formError.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isBusy || setupStatus.hasEnvOverride}
              className="app-primary-action min-h-11 w-full rounded-xl px-5 py-2.5 text-sm font-semibold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {primaryActionLabel}
            </button>
          </form>

          {setupStatus.sampleVaultPath && (
            <button
              type="button"
              onClick={() =>
                void submitSetup(
                  {
                    useSampleVault: true,
                    resetCorruptConfig: requiresCorruptReset,
                  },
                  "sample",
                )
              }
              disabled={isBusy || setupStatus.hasEnvOverride}
              className="min-h-11 w-full text-center text-sm text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Explore with the demo vault
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
