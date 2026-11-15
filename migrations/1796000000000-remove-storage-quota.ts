// The storage quota and the 1 GB vouchers are gone (#362): files are billed in gems by month, with a free allowance for
// everyone (docs/billing.md). Removes what the quota left behind:
//   - `users.xendrive` (the extra space granted by admins and redeemed vouchers)
//   - 1 GB XenDrive vouchers held in inventories (dropped, not converted: everyone gets the monthly allowance instead)
//   - the `counted` flag on file records
// `up` is repeatable. It can't be reversed: the extra space and the vouchers are not kept anywhere. Restore from a backup to
// go back.
import type { Connection } from "mongoose";

const VOUCHER = "1gb-xendrive-voucher";

export async function up(connection: Connection): Promise<void> {
  const users = connection.collection("users");
  const withSpace = await users.countDocuments({ "xendrive.spaceAllowed": { $gt: 0 } });
  const holders = await users.countDocuments({ "inventory.itemKey": VOUCHER });
  await users.updateMany({ xendrive: { $exists: true } }, { $unset: { xendrive: "" } });
  await users.updateMany({ "inventory.itemKey": VOUCHER }, { $pull: { inventory: { itemKey: VOUCHER } } } as never);
  await connection.collection("filerecords").updateMany({ counted: { $exists: true } }, { $unset: { counted: "" } });
  console.log(`remove-storage-quota: ${withSpace} people had extra space, ${holders} held a voucher`);
}

export async function down(): Promise<void> {
  throw new Error("irreversible: extra space and vouchers were not kept; restore from a backup");
}
