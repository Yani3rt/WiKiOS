import { useEffect, useState } from "react";

const IMAGE_CACHE_KEY = "wiki-os:person-images";
const MISSING_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
type ImageEntry = { url: string | null; expiresAt: number | null };
type ImageCache = Record<string, ImageEntry>;

function readImageCache(): ImageCache {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, entry]) =>
      entry && typeof entry === "object" &&
      (typeof entry.url === "string" || entry.url === null) &&
      ((typeof entry.url === "string" && entry.expiresAt === null) ||
        (typeof entry.expiresAt === "number" && entry.expiresAt > Date.now())),
    ));
  } catch {
    return {};
  }
}

export function usePersonImage(name: string | null): string | null {
  const [portrait, setPortrait] = useState(() => ({
    name, url: name ? readImageCache()[name]?.url ?? null : null,
  }));

  useEffect(() => {
    if (!name) return;
    const cached = readImageCache()[name];
    if (cached) {
      setPortrait({ name, url: cached.url });
      return;
    }

    const controller = new AbortController();
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    void (async () => {
      try {
        const response = await fetch(endpoint, {
          signal: controller.signal, headers: { Accept: "application/json" },
        });
        if (!response.ok && response.status !== 404) return;
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        const url = typeof data?.thumbnail?.source === "string" ? data.thumbnail.source : null;
        const entry: ImageEntry = { url, expiresAt: url ? null : Date.now() + MISSING_IMAGE_TTL_MS };
        try {
          localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify({ ...readImageCache(), [name]: entry }));
        } catch {
          // Portraits still work when storage is unavailable.
        }
        setPortrait({ name, url });
      } catch {
        // Aborted requests and network failures can retry on the next visit.
      }
    })();
    return () => controller.abort();
  }, [name]);

  return name && portrait.name === name ? portrait.url : null;
}
