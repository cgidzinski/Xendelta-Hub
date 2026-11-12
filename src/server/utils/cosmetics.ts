import { User } from "../models/user";
import { ITEMS } from "../constants/items";

/**
 * Take a cosmetic off when its last copy leaves the inventory (trashed or removed by an admin), so nobody keeps
 * wearing something they no longer own. A no-op for items that are not cosmetics or not worn.
 */
export async function unequipIfNotOwned(userId: unknown, itemKey: string): Promise<void> {
  const slot = ITEMS[itemKey]?.cosmetic?.slot;
  if (!slot) return;
  await User.updateOne(
    { _id: userId, [`cosmetics.${slot}`]: itemKey, "inventory.itemKey": { $ne: itemKey } },
    { $unset: { [`cosmetics.${slot}`]: "" } },
  ).exec();
}
