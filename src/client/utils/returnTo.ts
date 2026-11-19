// Where to go after signing in. A signed-out visitor who opens a deep link (a shared note, a notification) is sent to
// sign in; this remembers the address, query and all, so signing in, signing up or coming back from Google/GitHub lands
// on it. It lives in sessionStorage because OAuth leaves the site and returns. Never throws: storage may be blocked.

const KEY = "return-to";

/** Only an address on this site (one leading slash) is trusted, so a crafted value cannot send people elsewhere. */
export const isSafeReturnTo = (path: unknown): path is string =>
  typeof path === "string" && /^\/(?![/\\])/.test(path) && !/^\/(login|signup|reset-password)(\/|\?|#|$)/.test(path);

export function rememberReturnTo(path: string): void {
  if (!isSafeReturnTo(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // storage unavailable: signing in still works, it just lands on the home page
  }
}

export function peekReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    return isSafeReturnTo(path) ? path : null;
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** `/path?query#hash` of a router location. */
export const locationPath = (l: { pathname: string; search?: string; hash?: string }) =>
  `${l.pathname}${l.search ?? ""}${l.hash ?? ""}`;
