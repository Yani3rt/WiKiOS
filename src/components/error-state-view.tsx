import { Link } from "react-router-dom";

export function ErrorStateView({ message }: { message: string }) {
  return (
    <main className="app-state-view flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--brand-error)]">500</p>
        <h1 className="text-3xl font-semibold text-[var(--brand-deep-teal)]">Local wiki unavailable</h1>
        <p className="max-w-md text-[var(--muted-foreground)]">{message}</p>
      </div>
      <Link
        className="app-primary-action inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium active:scale-[0.97]"
        to="/"
      >
        Back to search
      </Link>
    </main>
  );
}
