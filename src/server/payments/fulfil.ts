import { GemPurchase } from "../models/gemPurchase";
import { User } from "../models/user";

/**
 * Complete a pending gem purchase and credit the gems. Safe to call more than once for the same purchase (a
 * provider webhook is delivered at least once): only the call that moves it from pending to completed credits.
 * Returns the gems credited, or 0 if it had already been fulfilled (or does not exist).
 */
export async function fulfilGemPurchase(purchaseId: string, providerRef?: string): Promise<number> {
  const purchase = await GemPurchase.findOneAndUpdate(
    { _id: purchaseId, status: "pending" },
    { $set: { status: "completed", completedAt: new Date(), ...(providerRef ? { providerRef } : {}) } },
    { new: true },
  ).exec();
  if (!purchase) return 0;
  await User.updateOne({ _id: purchase.user }, { $inc: { gems: purchase.gems } }).exec();
  return purchase.gems;
}
