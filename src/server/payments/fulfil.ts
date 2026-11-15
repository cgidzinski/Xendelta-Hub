import { GemPurchase } from "../models/gemPurchase";
import { HOUSE, transfer, userAccount } from "../billing/ledger";

/**
 * Complete a pending gem purchase and credit the gems. Safe to call more than once for the same purchase (a
 * provider webhook is delivered at least once): the credit is a ledger transfer keyed by the purchase, so it happens
 * once, and only the call that moves the purchase from pending to completed reports the gems.
 * Returns the gems credited, or 0 if it had already been fulfilled (or does not exist).
 */
export async function fulfilGemPurchase(purchaseId: string, providerRef?: string): Promise<number> {
  const purchase = await GemPurchase.findOne({ _id: purchaseId, status: "pending" }).exec();
  if (!purchase) return 0;
  // Credit first, then mark completed: a crash in between leaves a pending purchase whose retry finds the same
  // transfer, instead of a completed purchase without its gems.
  await transfer({
    from: HOUSE,
    to: userAccount(purchase.user),
    amount: purchase.gems,
    kind: "gem_purchase",
    idempotencyKey: `gem-purchase:${purchase._id}`,
    meta: { purchaseId: String(purchase._id), itemId: purchase.itemId },
  });
  const completed = await GemPurchase.findOneAndUpdate(
    { _id: purchase._id, status: "pending" },
    { $set: { status: "completed", completedAt: new Date(), ...(providerRef ? { providerRef } : {}) } },
    { new: true },
  ).exec();
  return completed ? completed.gems : 0;
}
