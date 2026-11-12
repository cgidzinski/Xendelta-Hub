import type { CosmeticSlot } from "@shared/cosmetics";

export type ItemKey = string;

export interface Item {
  key: ItemKey;
  name: string;
  description: string;
  image: string;
  redeemable: boolean;
  /**
   * Retired items are no longer sold or gifted but can still be redeemed by people who already hold one,
   * so nobody loses what they paid for.
   */
  legacy?: boolean;
  /** Set on items that are worn rather than redeemed: which slot of how someone looks they fill. */
  cosmetic?: { slot: CosmeticSlot };
  /** The effect of redeeming. Must change the user with a single atomic update, never read-modify-save. */
  apply?: (userId: string) => Promise<void>;
}
