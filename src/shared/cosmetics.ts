// Cosmetics: items that change how a person looks to others. The server stores which one is worn per slot (by item
// key) and sends it along with a user's public info; the client turns the key into something to draw.
// Frames and name colours store a colour *name* (a theme palette path such as "warning.main"), never a colour literal.

/** What a person is wearing, per slot. Absent or undefined means nothing in that slot. */
export interface Cosmetics {
  /** The item key of the badge shown next to their name. */
  badge?: string;
  /** The item key of the ring drawn around their avatar. */
  frame?: string;
  /** The item key of the colour their name is drawn in. */
  nameColour?: string;
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

/** The colours a frame or name colour can use: a label and a theme palette path (`sx` colour syntax, e.g. "info.main"). */
const COLOURS = {
  sky: { label: "Sky", token: "info.main" },
  emerald: { label: "Emerald", token: "success.main" },
  rose: { label: "Rose", token: "error.main" },
  gold: { label: "Gold", token: "warning.main" },
} as const;

export interface ColourCosmetic {
  label: string;
  /** A theme palette path, never a colour literal. */
  token: string;
  /** Shop price in gems. */
  price: number;
}

const PRICES: Record<keyof typeof COLOURS, number> = { sky: 1500, emerald: 2500, rose: 4000, gold: 6000 };

const colourItems = (prefix: string, noun: string): Record<string, ColourCosmetic> =>
  Object.fromEntries(
    (Object.keys(COLOURS) as (keyof typeof COLOURS)[]).map((name) => [
      `${prefix}-${name}`,
      { label: `${COLOURS[name].label} ${noun}`, token: COLOURS[name].token, price: PRICES[name] },
    ]),
  );

/** Avatar frames that exist, by item key. */
export const FRAMES: Record<string, ColourCosmetic> = colourItems("frame", "Frame");

/** Name colours that exist, by item key. */
export const NAME_COLOURS: Record<string, ColourCosmetic> = colourItems("name", "Name");

/** The frame someone is wearing, or undefined if they wear none (or one we no longer know). */
export function wornFrame(cosmetics: Cosmetics | null | undefined): (ColourCosmetic & { key: string }) | undefined {
  const key = cosmetics?.frame;
  return key && FRAMES[key] ? { key, ...FRAMES[key] } : undefined;
}

/** The name colour someone is wearing, or undefined if they wear none (or one we no longer know). */
export function wornNameColour(
  cosmetics: Cosmetics | null | undefined,
): (ColourCosmetic & { key: string }) | undefined {
  const key = cosmetics?.nameColour;
  return key && NAME_COLOURS[key] ? { key, ...NAME_COLOURS[key] } : undefined;
}

/** The slot an item key fills, or undefined for something that isn't worn. */
export function slotOf(itemKey: string): CosmeticSlot | undefined {
  if (itemKey in BADGES) return "badge";
  if (itemKey in FRAMES) return "frame";
  if (itemKey in NAME_COLOURS) return "nameColour";
  return undefined;
}

/** Whether this item is what the person is wearing in its slot right now. */
export function isWorn(cosmetics: Cosmetics | null | undefined, itemKey: string): boolean {
  const slot = slotOf(itemKey);
  return !!slot && cosmetics?.[slot] === itemKey;
}
