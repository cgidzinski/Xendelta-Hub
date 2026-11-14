// The emoji the picker offers, loaded on demand (the data is about 570 KB, so it is a separate chunk that nothing
// downloads until someone opens a picker), and the pure helpers for searching it, choosing a skin tone and remembering
// recent picks.

export interface EmojiEntry {
  /** The emoji itself, in its default (yellow) form. */
  emoji: string;
  label: string;
  tags: string[];
  /** The group's id (see EMOJI_GROUPS). */
  group: number;
  /** Where it sits in the standard ordering. */
  order: number;
  /** The five skin-tone variants, lightest first. Empty when the emoji has no skin tones. */
  skins: string[];
  /** The `:name:` people type for it, if it has one. */
  shortcode?: string;
}

/** The categories, in the order the picker shows them. (Group 2 is the skin-tone swatches themselves, never offered.) */
export const EMOJI_GROUPS = [
  { id: 0, label: "Smileys & emotion" },
  { id: 1, label: "People & body" },
  { id: 3, label: "Animals & nature" },
  { id: 4, label: "Food & drink" },
  { id: 5, label: "Travel & places" },
  { id: 6, label: "Activities" },
  { id: 7, label: "Objects" },
  { id: 8, label: "Symbols" },
  { id: 9, label: "Flags" },
] as const;

/** 0 is the default yellow; 1 to 5 are light to dark. */
export const SKIN_TONES = [0, 1, 2, 3, 4, 5] as const;
export type SkinTone = (typeof SKIN_TONES)[number];
export const isSkinTone = (v: unknown): v is SkinTone =>
  typeof v === "number" && (SKIN_TONES as readonly number[]).includes(v);

export const RECENT_EMOJI_MAX = 24;

interface RawEmoji {
  hexcode?: string;
  label: string;
  unicode: string;
  group?: number;
  order?: number;
  tags?: string[];
  skins?: Array<{ unicode: string }>;
}

/** Turn the package's records into entries: no skin-tone swatches, one variant per tone, shortcodes attached. */
export function buildEntries(raw: RawEmoji[], shortcodes: Record<string, string | string[]> = {}): EmojiEntry[] {
  const out: EmojiEntry[] = [];
  for (const r of raw) {
    if (r.group === undefined || r.group === 2) continue;
    const code = r.hexcode ? shortcodes[r.hexcode] : undefined;
    out.push({
      emoji: r.unicode,
      label: r.label,
      tags: r.tags ?? [],
      group: r.group,
      order: r.order ?? 0,
      // Couples and families come with 25 variants; only the five single-person tones are offered.
      skins: r.skins && r.skins.length === 5 ? r.skins.map((s) => s.unicode) : [],
      shortcode: Array.isArray(code) ? code[0] : code,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

let loading: Promise<EmojiEntry[]> | undefined;

/** Every emoji, loaded once. */
export function loadEmoji(): Promise<EmojiEntry[]> {
  loading ??= Promise.all([
    import("emojibase-data/en/compact.json"),
    import("emojibase-data/en/shortcodes/github.json"),
  ])
    .then(([compact, codes]) =>
      buildEntries(compact.default as unknown as RawEmoji[], codes.default as Record<string, string | string[]>),
    )
    .catch((e) => {
      loading = undefined; // a failed load can be retried the next time the picker opens
      throw e;
    });
  return loading;
}

/** The emoji in the person's chosen skin tone (the default form when it has none, or tone 0). */
export const withTone = (entry: Pick<EmojiEntry, "emoji" | "skins">, tone: SkinTone): string =>
  tone === 0 ? entry.emoji : (entry.skins[tone - 1] ?? entry.emoji);

/** Entries that match what was typed, best first: a label that starts with it, then one that contains it, then tags. */
export function searchEmoji(entries: EmojiEntry[], query: string, limit = 120): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ entry: EmojiEntry; score: number }> = [];
  for (const entry of entries) {
    const label = entry.label.toLowerCase();
    const code = entry.shortcode?.toLowerCase() ?? "";
    let score = 0;
    if (code === q || label === q) score = 100;
    else if (label.startsWith(q) || code.startsWith(q)) score = 80;
    else if (label.split(/[\s:,-]+/).some((w) => w.startsWith(q))) score = 60;
    else if (entry.tags.some((t) => t.toLowerCase() === q)) score = 50;
    else if (entry.tags.some((t) => t.toLowerCase().startsWith(q))) score = 40;
    else if (label.includes(q) || code.includes(q)) score = 20;
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Put a pick at the front of the recent list (once), keeping the list short. */
export function recordRecent(recent: readonly string[], emoji: string, max = RECENT_EMOJI_MAX): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, max);
}

export const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
