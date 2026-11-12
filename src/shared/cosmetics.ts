// Cosmetics: items that change how a person looks to others. The server stores which one is worn per slot (by item
// key) and sends it along with a user's public info; the client turns the key into something to draw.
// Roadmap for more slots (frames, name colours): docs/monetization.md.

/** What a person is wearing, per slot. Absent or undefined means nothing in that slot. */
export interface Cosmetics {
  /** The item key of the badge shown next to their name. */
  badge?: string;
}

export type CosmeticSlot = keyof Cosmetics;

/** Badges that exist, by item key. The client picks the icon; this is the part both sides must agree on. */
export const BADGES: Record<string, { label: string }> = {
  "golden-badge": { label: "Golden Badge" },
};

/** The badge someone is wearing, or undefined if they wear none (or one we no longer know). */
export function wornBadge(cosmetics: Cosmetics | null | undefined): { key: string; label: string } | undefined {
  const key = cosmetics?.badge;
  return key && BADGES[key] ? { key, ...BADGES[key] } : undefined;
}
