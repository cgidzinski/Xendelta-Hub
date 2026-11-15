// A fresh start for gems (#376): they become 1,000 to the dollar, and instead of converting old balances everyone starts
// again from zero. Every person's gems and every community's fund go to 0, every inventory is emptied (and anything
// worn comes off), and the gem ledger's history is cleared so it starts from the same zero. Purchases of gem packs
// (`gempurchases`) are kept as the record of real payments; buying gems was switched off, so there are none to honour.
//
// `up` is repeatable: it only sets values, so a second run changes nothing.
//
// `down` can't undo it: the old balances and items are gone. Restore from a backup to get them back.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  await connection
    .collection("users")
    .updateMany({}, { $set: { gems: 0, inventory: [] }, $unset: { gemTxApplied: "", "cosmetics.badge": "" } });
  await connection.collection("communities").updateMany({}, { $set: { fund: 0 }, $unset: { gemTxApplied: "" } });
  await connection.collection("gemtransactions").deleteMany({});
}

export async function down(): Promise<void> {
  throw new Error(
    "irreversible: old gem balances and inventories were deleted; restore from a backup to get them back",
  );
}
