import { useCallback, useEffect, useState } from "react";
import { CHANGELOG } from "@shared/changelog";
import { entryKey, SEEN_KEY, unseenCount } from "../routes/Internal/About/seen";
import { getRawStored, setRawStored } from "./useLocalStorageState";

const CHANGED = "whatsnew:changed";

/**
 * What's new in the apps, as far as this device has seen: how many entries are new, and a way to mark them all seen. Every user of the
 * hook (the sidebar's "New" tag, the page) is told when it changes, so the tag goes away as soon as the page is opened.
 */
export function useWhatsNew() {
  const [seen, setSeen] = useState<string | null>(() => getRawStored(SEEN_KEY));
  useEffect(() => {
    const reread = () => setSeen(getRawStored(SEEN_KEY));
    window.addEventListener(CHANGED, reread);
    return () => window.removeEventListener(CHANGED, reread);
  }, []);
  const markSeen = useCallback(() => {
    const newest = CHANGELOG[0];
    if (!newest) return;
    setRawStored(SEEN_KEY, entryKey(newest));
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return { seen, unseen: unseenCount(CHANGELOG, seen), markSeen };
}
