import { Link, redirect, useLoaderData, useNavigate, useRevalidator, type LoaderFunctionArgs } from "react-router-dom";

import { NoteViewer } from "@/components/note-viewer";
import type { WikiPageData } from "@/lib/wiki-shared";

import { useWikiConfig } from "../wiki-config";
import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

function normalizeSplatParam(rawSplat: string | undefined) {
  const trimmed = rawSplat?.trim();

  if (!trimmed) {
    throw new Response("Wiki page not found", { status: 404 });
  }

  return trimmed
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function loader({ params }: LoaderFunctionArgs) {
  const slug = normalizeSplatParam(params["*"]);
  try {
    return await fetchJson<WikiPageData>(`/api/wiki/${slug}`);
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const page = useLoaderData() as WikiPageData;
  const config = useWikiConfig();
  const navigate = useNavigate();
  const { revalidate, state: revalidationState } = useRevalidator();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:gap-3 sm:px-6 sm:pb-4 sm:pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <Link to="/" className="font-display text-lg text-[var(--foreground)] sm:text-xl">
          {config.siteTitle}
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Link
            to="/graph"
            className="surface rounded-full px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] sm:px-4"
          >
            {config.navigation.graphLabel}
          </Link>
          <Link
            to="/stats"
            className="surface rounded-full px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] sm:px-4"
          >
            {config.navigation.statsLabel}
          </Link>
        </div>
      </header>

      <main
        className="animate-in mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-8 lg:px-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
      >
        <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Link to="/" className="transition-colors duration-150 hover:text-[var(--foreground)]">
            Home
          </Link>
          <span className="select-none">/</span>
          <span className="text-[var(--foreground)]">{page.title}</span>
        </nav>

        <NoteViewer
          page={page}
          onNavigateNote={(slug) => navigate(`/wiki/${slug}`)}
          onRefreshPage={() => revalidate()}
          refreshing={revalidationState === "loading"}
        />
      </main>

      <footer className="pb-16" />
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
