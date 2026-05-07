const TOKEN_KEY = "praxion.auth.token";
const NAME_KEY = "praxion.auth.name";
const LEGACY_USERNAME_KEY = "praxion.auth.username";

export function loadAuthSession(): { token: string; name: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return null;
  }
  const name =
    window.localStorage.getItem(NAME_KEY) ??
    window.localStorage.getItem(LEGACY_USERNAME_KEY) ??
    "Account";
  return { token, name };
}

export function saveAuthSession(token: string, name: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NAME_KEY, name);
  window.localStorage.removeItem(LEGACY_USERNAME_KEY);
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NAME_KEY);
  window.localStorage.removeItem(LEGACY_USERNAME_KEY);
}
