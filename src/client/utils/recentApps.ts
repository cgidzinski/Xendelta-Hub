import { APPS_REGISTRY } from "../constants/apps";
import { browserStorage, readStored, writeStored } from "../hooks/useLocalStorageState";

// The sub-apps this person opened most recently, newest first, so Home can offer them next to the pinned apps. A
// per-browser convenience: storage can be empty, blocked or hold an old value, and nothing breaks.
const KEY = "xendelta:recentApps";
export const MAX_RECENT_APPS = 6;

const isKeyList = (v: unknown): v is string[] => Array.isArray(v) && v.every((k) => typeof k === "string");

/** The app a path belongs to ("/internal/xennote/abc" is XenNote), or null for Home, Chat and anything else. */
export function appKeyForPath(path: string): string | null {
  return APPS_REGISTRY.find((a) => path === a.path || path.startsWith(`${a.path}/`))?.key ?? null;
}

/** The list after opening `key`: it moves to the front, duplicates drop, and it is capped. */
export const withRecentApp = (list: string[], key: string): string[] =>
  [key, ...list.filter((k) => k !== key)].slice(0, MAX_RECENT_APPS);

/** Stored keys that are still real apps (an app removed since is dropped). */
export function readRecentApps(): string[] {
  const known = new Set(APPS_REGISTRY.map((a) => a.key));
  return readStored(browserStorage(), KEY, isKeyList, []).filter((k) => known.has(k));
}

/** Note a visit to `path`; paths outside the sub-apps are ignored. */
export function rememberRecentApp(path: string): void {
  const key = appKeyForPath(path);
  if (!key) return;
  const current = readRecentApps();
  if (current[0] === key) return;
  writeStored(browserStorage(), KEY, withRecentApp(current, key));
}
