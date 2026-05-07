import { loadAuthSession } from "@/lib/authStorage";

/** Base URL for API (no trailing slash). Empty = same origin (use Vite `server.proxy` in dev). */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (raw == null || String(raw).trim() === "") {
    return "";
  }
  return String(raw).replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

let tokenProvider: (() => string | null) | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setTokenProvider(provider: () => string | null): void {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export async function apiFetch(path: string, init?: RequestInit, requireAuth = true): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let bearerSent: string | null = null;
  if (requireAuth) {
    const token = tokenProvider?.() ?? loadAuthSession()?.token ?? null;
    bearerSent = token;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(apiUrl(path), { ...init, headers });
  /* Only clear session if the server rejected a request we actually authenticated.
     Avoids spurious logouts when a race fires apiFetch before the token provider is wired,
     or when 401 means "no credentials" rather than "bad/expired JWT". */
  if (response.status === 401 && requireAuth && bearerSent) {
    unauthorizedHandler?.();
  }
  return response;
}
