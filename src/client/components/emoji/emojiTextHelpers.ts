import { EMOJI_TOKEN, type CustomEmoji } from "@shared/emoji";
import type { EmojiEntry } from "./emojiData";

// Reading emoji out of text: the `:shortcode` someone is typing, and whether a message is only emoji.

export interface ShortcodeMatch {
  /** Where the colon is. */
  start: number;
  /** What follows the colon so far. */
  query: string;
}

/** The `:partial` right before the cursor, if there is one. It must start a word, and have at least two letters. */
export function shortcodeBeforeCaret(text: string, caret: number): ShortcodeMatch | null {
  const before = text.slice(0, caret);
  const m = /(^|\s):([a-z0-9_+-]{2,})$/i.exec(before);
  if (!m) return null;
  return { start: before.length - m[2]!.length - 1, query: m[2]!.toLowerCase() };
}

/** Emoji whose `:name:` starts with what was typed, then ones that contain it. At most `limit`. */
export function suggestShortcodes(entries: EmojiEntry[], query: string, limit = 8): EmojiEntry[] {
  const q = query.toLowerCase();
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const e of entries) {
    const code = e.shortcode?.toLowerCase();
    if (!code) continue;
    if (code.startsWith(q)) starts.push(e);
    else if (code.includes(q)) contains.push(e);
  }
  const byOrder = (a: EmojiEntry, b: EmojiEntry) => a.order - b.order;
  return [
    ...starts.sort((a, b) => a.shortcode!.length - b.shortcode!.length || byOrder(a, b)),
    ...contains.sort(byOrder),
  ].slice(0, limit);
}

const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

/** One to three emoji (a custom emoji counts as one) and nothing else (spaces aside): such a message is drawn large. */
export function isEmojiOnly(body: string, max = 3): boolean {
  const text = body.replace(EMOJI_TOKEN, "😀").trim();
  if (!text) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) continue;
    if (!EMOJI.test(segment)) return false;
    if (++count > max) return false;
  }
  return count > 0;
}

export type EmojiTextPart = { type: "text"; text: string } | { type: "emoji"; name: string; id: string };

/** A message body cut into plain text and custom emoji tokens, in order. */
export function splitEmojiText(body: string): EmojiTextPart[] {
  const parts: EmojiTextPart[] = [];
  let last = 0;
  for (const m of body.matchAll(EMOJI_TOKEN)) {
    if (m.index > last) parts.push({ type: "text", text: body.slice(last, m.index) });
    parts.push({ type: "emoji", name: m[1]!, id: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

/** The custom emoji whose name starts with what was typed, then ones that contain it. */
export function suggestCustom(custom: CustomEmoji[], query: string, limit = 8): CustomEmoji[] {
  const q = query.toLowerCase();
  const starts = custom.filter((e) => e.name.startsWith(q));
  const contains = custom.filter((e) => !e.name.startsWith(q) && e.name.includes(q));
  return [...starts, ...contains].slice(0, limit);
}
