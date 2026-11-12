// API keys: a way to call the existing app routes without a browser session (Home Assistant, scripts, an MCP
// wrapper). A key is sent as `Authorization: Bearer xd_...` and is accepted by `authenticateToken` in place of a
// session JWT. What a key may reach is an allowlist: an app is reachable only if it is listed here, so a new
// non-app route (auth, shop, admin, key management) is closed to keys by default.

export const API_KEY_PREFIX = "xd_";

/** Per user. */
export const API_KEY_MAX_PER_USER = 20;

/** App key (the same keys as the client's APPS_REGISTRY) -> the URL path prefixes that belong to it. */
export const API_KEY_APPS: Record<string, readonly string[]> = {
  recipaint: ["/api/recipaint", "/api/paints", "/api/paint-catalogue"],
  xendrive: ["/api/xendrive"],
  xenlink: ["/api/xenlink"],
  xensplit: ["/api/xensplit"],
  xenbudget: ["/api/xenbudget"],
  xenroutine: ["/api/xenroutine"],
  xenkitchen: ["/api/xenkitchen"],
  xennote: ["/api/xennote"],
};

export const API_KEY_APP_KEYS = Object.keys(API_KEY_APPS);

/** Routes outside any app that a key may still call (a "who am I" check). Exact path, GET only. */
export const API_KEY_EXTRA_GET_PATHS: readonly string[] = ["/api/user/profile"];

const startsWithPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** The app a request path belongs to, or null if it is not an app route. */
export function appForPath(path: string): string | null {
  for (const [app, prefixes] of Object.entries(API_KEY_APPS)) {
    if (prefixes.some((p) => startsWithPrefix(path, p))) return app;
  }
  return null;
}

export type ApiKeyAccess = { ok: true } | { ok: false; reason: string };

/** Whether a key with these limits may make this request. `apps` empty means every app. */
export function checkApiKeyAccess(
  key: { apps: readonly string[]; readOnly: boolean },
  method: string,
  path: string,
): ApiKeyAccess {
  const verb = method.toUpperCase();
  const safe = verb === "GET" || verb === "HEAD";
  if (key.readOnly && !safe) return { ok: false, reason: "This API key is read-only" };

  if (safe && API_KEY_EXTRA_GET_PATHS.includes(path)) return { ok: true };

  const app = appForPath(path);
  if (!app) return { ok: false, reason: "Not available with an API key" };
  if (key.apps.length > 0 && !key.apps.includes(app)) return { ok: false, reason: "This API key can't use that app" };
  return { ok: true };
}
