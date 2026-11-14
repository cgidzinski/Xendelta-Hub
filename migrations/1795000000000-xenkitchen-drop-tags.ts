// XenKitchen tags are gone: items can no longer be tagged, filtered by tag or searched by tag. The leftover
// `xenkitchenitems.tags` arrays are removed so nothing stale stays in the documents.
//
// `up` is repeatable: it only touches items that still have `tags`.
//
// `down` can't undo it: the tag values are deleted. Restore from a backup to get them back.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  await connection.collection("xenkitchenitems").updateMany({ tags: { $exists: true } }, { $unset: { tags: "" } });
}

export async function down(): Promise<void> {
  throw new Error("irreversible: XenKitchen tag values were deleted; restore from a backup to get them back");
}
