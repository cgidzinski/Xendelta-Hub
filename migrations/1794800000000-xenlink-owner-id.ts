// XenLink ownership (#258). A link used to be owned by being listed in `users.xenlink` (an array of link ids), so
// listing, editing and deleting all loaded the user and the two documents could drift apart. Now every link carries
// its owner's id in `owner_id` (indexed) and `users.xenlink` is removed.
//
// `up` is repeatable: it only stamps links that have no owner yet, and only touches users that still have the old
// field. A link no user listed (left behind by an old account deletion) stays without an owner; it still redirects.
// `down` puts each owned link back into its owner's `xenlink` array and clears `owner_id`.
import type { Connection } from "mongoose";
import { Types } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const users = connection.collection("users");
  const links = connection.collection("xenlinks");

  await links.createIndex({ owner_id: 1 });

  const owners = users.find({ xenlink: { $exists: true } }, { projection: { xenlink: 1 } });
  for await (const user of owners) {
    const ids = (user.xenlink ?? []) as Types.ObjectId[];
    if (ids.length > 0) {
      await links.updateMany(
        { _id: { $in: ids }, owner_id: { $exists: false } },
        { $set: { owner_id: String(user._id) } },
      );
    }
    await users.updateOne({ _id: user._id }, { $unset: { xenlink: "" } });
  }
}

export async function down(connection: Connection): Promise<void> {
  const users = connection.collection("users");
  const links = connection.collection("xenlinks");

  const owned = links.find({ owner_id: { $type: "string" } }, { projection: { owner_id: 1 } });
  for await (const link of owned) {
    if (!Types.ObjectId.isValid(link.owner_id)) continue;
    await users.updateOne({ _id: new Types.ObjectId(link.owner_id) }, { $addToSet: { xenlink: link._id } });
  }
  await links.updateMany({}, { $unset: { owner_id: "" } });
  await links.dropIndex("owner_id_1").catch(() => undefined);
}
