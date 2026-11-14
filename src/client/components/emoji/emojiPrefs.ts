import { browserStorage, readStored, writeStored } from "../../hooks/useLocalStorageState";
import { QUICK_REACTIONS } from "../../constants/chat";
import { isSkinTone, isStringList, recordRecent, type SkinTone } from "./emojiData";

// What the picker remembers on this device: the skin tone and the emoji used lately. Per browser, never required.
export const RECENT_EMOJI_KEY = "xensuite.emoji.recent";
export const SKIN_TONE_KEY = "xensuite.emoji.tone";

export const readRecentEmoji = (): string[] => readStored(browserStorage(), RECENT_EMOJI_KEY, isStringList, []);
export const readSkinTone = (): SkinTone => readStored<SkinTone>(browserStorage(), SKIN_TONE_KEY, isSkinTone, 0);
export const writeSkinTone = (tone: SkinTone) => writeStored(browserStorage(), SKIN_TONE_KEY, tone);

/** Remember an emoji as just used, and return the new list. */
export function rememberEmoji(emoji: string): string[] {
  const next = recordRecent(readRecentEmoji(), emoji);
  writeStored(browserStorage(), RECENT_EMOJI_KEY, next);
  return next;
}

/** The few reactions offered on a message: what you used lately, filled out with the usual ones. */
export function quickReactions(
  recent: readonly string[],
  defaults: readonly string[] = QUICK_REACTIONS,
  count = 6,
): string[] {
  return [...new Set([...recent, ...defaults])].slice(0, count);
}
