import { GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import type { ChangelogEntry } from "@shared/changelog";

/** Each app's changes (newest first), in the order the apps are listed: the hub as a whole first, then every app. */
export function changesByApp(entries: ChangelogEntry[]): Array<{ app: GuideApp; entries: ChangelogEntry[] }> {
  return GUIDE_APPS.map((app) => ({ app, entries: entries.filter((e) => e.app === app) }));
}
