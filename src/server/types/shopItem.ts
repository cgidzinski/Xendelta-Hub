import { ItemKey } from "./item";

/**
 * Something the Shop sells. Exactly one price is set: `price` (gems) for things bought with gems, or `priceCents`
 * (with `currency`) for things bought with real money, which go through the payment provider.
 */
export interface ShopItem {
  id: string;
  itemKey: ItemKey;
  category: string;
  /** Price in gems. */
  price?: number;
  /** Price in the currency's minor unit (cents). */
  priceCents?: number;
  currency?: string;
  /** Gems added to the balance when this is bought (the gem packs). */
  grantsGems?: number;
  /** Short label on the card, e.g. "Popular". */
  badge?: string;
  /** False for things that take effect on purchase and never show in the inventory. Defaults to true. */
  addToInventory?: boolean;
  onPurchase?: (user: any) => Promise<void>;
}

export type ShopItems = ShopItem[];
