import { ShopItem } from "../types/shopItem";
import { GEM_PACKS } from "@shared/monetization";

// Each item has exactly one price: `price` in gems, or `priceCents` in money (the gem packs). Both must be positive
// integers (shop.test.ts pins that: a negative price once paid the buyer). Legacy items in constants/items.ts are
// deliberately not listed.
const GEM_PACK_SHOP_ITEMS: ShopItem[] = GEM_PACKS.map((pack) => ({
  id: pack.id,
  itemKey: pack.id,
  category: "Gems",
  priceCents: pack.priceCents,
  currency: pack.currency,
  grantsGems: pack.gems,
  badge: pack.badge,
  addToInventory: false,
}));

export const SHOP_ITEMS: ShopItem[] = [
  ...GEM_PACK_SHOP_ITEMS,
  {
    id: "2",
    itemKey: "1gb-xendrive-voucher",
    price: 1000,
    category: "Storage",
  },
  {
    id: "3",
    itemKey: "golden-badge",
    price: 5000,
    category: "Perks",
  },
];
