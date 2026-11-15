// What the app sells, shared by the server (which charges for it) and the client (which shows it).
// Roadmap and the reasoning behind these numbers: docs/monetization.md.
//
// Prices are whole cents. The base rate is 1,000 gems to the dollar (200 before #376), and larger packs add a bonus.

/**
 * The gem packs on sale. They are listed in the Shop like any other item (see server/constants/shopItems.ts):
 * an item priced in money that grants gems when it is paid for.
 */
export interface GemPack {
  id: string;
  gems: number;
  priceCents: number;
  currency: "USD";
  /** Short label shown on the pack card, e.g. "Popular". */
  badge?: string;
}

export const GEM_PACKS: readonly GemPack[] = [
  { id: "gems-5000", gems: 5_000, priceCents: 500, currency: "USD" },
  { id: "gems-11000", gems: 11_000, priceCents: 1_000, currency: "USD" },
  { id: "gems-30000", gems: 30_000, priceCents: 2_500, currency: "USD", badge: "Popular" },
  { id: "gems-65000", gems: 65_000, priceCents: 5_000, currency: "USD", badge: "Best value" },
];

/** XenDrive space every account has before buying anything. */
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB

/** The base rate before any pack bonus: what the smallest pack pays per dollar. */
export const BASE_GEMS_PER_DOLLAR = 1000;

/** How many percent more gems a pack gives than the base rate would (0 for the smallest). */
export function gemBonusPercent(gems: number, priceCents: number): number {
  const base = (priceCents / 100) * BASE_GEMS_PER_DOLLAR;
  return Math.max(0, Math.round((gems / base - 1) * 100));
}

/** The XenDrive voucher: its inventory/shop key and the space it adds when redeemed. */
export const STORAGE_VOUCHER_KEY = "1gb-xendrive-voucher";
export const STORAGE_VOUCHER_BYTES = 1024 * 1024 * 1024; // 1 GB
