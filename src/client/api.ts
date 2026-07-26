import type { WikiLinkAmbiguityData, WikiPageData } from "@/lib/wiki-shared";

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? (await response.json()) as unknown
    : await response.text();
}

function responseFromFailedPayload(response: Response, payload: unknown) {
  const message =
    typeof payload === "string"
      ? payload
      : payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
        ? payload.error
        : response.statusText;

  return new Response(message, {
    status: response.status,
    statusText: response.statusText,
  });
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw responseFromFailedPayload(response, payload);
  }

  return payload as T;
}

export type WikiPageLoadResult =
  | { status: "ready"; page: WikiPageData }
  | { status: "ambiguous"; ambiguity: WikiLinkAmbiguityData };

export async function fetchWikiPage(
  input: string,
  init?: RequestInit,
): Promise<WikiPageLoadResult> {
  const response = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });
  const payload = await readResponsePayload(response);

  if (response.status === 300) {
    return {
      status: "ambiguous",
      ambiguity: payload as WikiLinkAmbiguityData,
    };
  }
  if (!response.ok) {
    throw responseFromFailedPayload(response, payload);
  }
  return { status: "ready", page: payload as WikiPageData };
}

export function isSetupRequiredResponse(error: unknown) {
  return error instanceof Response && error.status === 409;
}
