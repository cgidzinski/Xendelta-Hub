import { ShopItem } from "../types/shopItem";

// Prices are in gems and must be positive integers (gems.test.ts pins that: a negative price once paid
// the buyer). Legacy items in constants/items.ts are deliberately not listed.
export const SHOP_ITEMS: ShopItem[] = [
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
