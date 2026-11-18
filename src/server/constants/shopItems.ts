import { ShopItem } from "../types/shopItem";
import { GEM_PACKS } from "@shared/monetization";
import { BADGES, FRAMES, NAME_COLOURS } from "@shared/cosmetics";

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

// The Golden Badge is listed by hand below, in the Perks category it has always been in.
const COSMETIC_SHOP_ITEMS: ShopItem[] = [
  ...Object.entries(BADGES).filter(([key]) => key !== "golden-badge"),
  ...Object.entries(FRAMES),
  ...Object.entries(NAME_COLOURS),
].map(([key, c]) => ({ id: key, itemKey: key, price: c.price, category: "Cosmetics" }));

export const SHOP_ITEMS: ShopItem[] = [
  ...GEM_PACK_SHOP_ITEMS,
  ...COSMETIC_SHOP_ITEMS,
  {
    id: "3",
    itemKey: "golden-badge",
    price: 25000,
    category: "Perks",
  },
];
