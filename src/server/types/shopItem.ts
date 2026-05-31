import { ItemKey } from "./item";

export interface ShopItem {
  id: string;
  itemKey: ItemKey;
  price: number;
  category: string;
  addToInventory?: boolean;
  onPurchase?: (user: any) => Promise<void>;
}

export type ShopItems = ShopItem[];