// What the app sells, shared by the server (which charges for it) and the client (which shows it).
// Roadmap and the reasoning behind these numbers: docs/monetization.md.
//
// Prices are whole cents. The base rate is 200 gems to the dollar, and larger packs add a bonus.

export interface GemPack {
  id: string;
  gems: number;
  priceCents: number;
  currency: "USD";
  /** Short label shown on the pack card, e.g. "Popular". */
  badge?: string;
}

export const GEM_PACKS: readonly GemPack[] = [
  { id: "gems-1000", gems: 1_000, priceCents: 500, currency: "USD" },
  { id: "gems-2200", gems: 2_200, priceCents: 1_000, currency: "USD" },
  { id: "gems-6000", gems: 6_000, priceCents: 2_500, currency: "USD", badge: "Popular" },
  { id: "gems-13000", gems: 13_000, priceCents: 5_000, currency: "USD", badge: "Best value" },
];

export const GEM_PACK_IDS = GEM_PACKS.map((p) => p.id) as [string, ...string[]];

export function findGemPack(id: string): GemPack | undefined {
  return GEM_PACKS.find((p) => p.id === id);
}

/** XenDrive space every account has before buying anything. */
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB

/** The base rate before any pack bonus: what the smallest pack pays per dollar. */
export const BASE_GEMS_PER_DOLLAR = 200;

/** How many percent more gems a pack gives than the base rate would (0 for the smallest). */
export function packBonusPercent(pack: GemPack): number {
  const base = (pack.priceCents / 100) * BASE_GEMS_PER_DOLLAR;
  return Math.max(0, Math.round((pack.gems / base - 1) * 100));
}

/** The XenDrive voucher: its inventory/shop key and the space it adds when redeemed. */
export const STORAGE_VOUCHER_KEY = "1gb-xendrive-voucher";
export const STORAGE_VOUCHER_BYTES = 1024 * 1024 * 1024; // 1 GB
