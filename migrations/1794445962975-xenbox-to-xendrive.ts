// XenBox became XenDrive (#179). The XenBox storage folder was deleted by hand and only its author used
// it, so there are no files left to carry over. This migration:
//   1. deletes the XenBox file and upload-session records (their bytes are gone) and drops both collections;
//   2. moves each user's quota (users.xenbox.spaceAllowed) to users.xendrive.spaceAllowed;
//   3. renames the pinned app "xenbox" to "xendrive";
//   4. renames the "1gb-xenbox-voucher" inventory item to "1gb-xendrive-voucher".
// Admin-granted quota and vouchers a person already bought are kept; nothing else about XenBox is.
import type { Connection } from "mongoose";

async function dropIfExists(connection: Connection, name: string): Promise<void> {
  const exists = await connection.db!.listCollections({ name }).hasNext();
  if (exists) await connection.db!.dropCollection(name);
}

export async function up(connection: Connection): Promise<void> {
  await dropIfExists(connection, "xenboxmedias");
  await dropIfExists(connection, "xenboxuploadsessions");

  const users = connection.collection("users");
  const withQuota = users.find({ "xenbox.spaceAllowed": { $exists: true } }, { projection: { xenbox: 1 } });
  for await (const u of withQuota) {
    await users.updateOne(
      { _id: u._id },
      { $set: { "xendrive.spaceAllowed": u.xenbox.spaceAllowed ?? 0 }, $unset: { xenbox: "" } },
    );
  }
  await users.updateMany({ xenbox: { $exists: true } }, { $unset: { xenbox: "" } });

  await users.updateMany(
    { pinnedApps: "xenbox" },
    { $set: { "pinnedApps.$[p]": "xendrive" } },
    { arrayFilters: [{ p: "xenbox" }] },
  );

  await users.updateMany(
    { "inventory.itemKey": "1gb-xenbox-voucher" },
    {
      $set: {
        "inventory.$[i].itemKey": "1gb-xendrive-voucher",
        "inventory.$[i].name": "1GB XenDrive Voucher",
        "inventory.$[i].description": "Redeem this voucher to get 1GB of XenDrive space added to your account",
      },
    },
    { arrayFilters: [{ "i.itemKey": "1gb-xenbox-voucher" }] },
  );
}

export async function down(connection: Connection): Promise<void> {
  // The deleted XenBox file records are not restored: their stored files no longer exist.
  const users = connection.collection("users");
  const withQuota = users.find({ "xendrive.spaceAllowed": { $exists: true } }, { projection: { xendrive: 1 } });
  for await (const u of withQuota) {
    await users.updateOne(
      { _id: u._id },
      { $set: { "xenbox.spaceAllowed": u.xendrive.spaceAllowed ?? 0 }, $unset: { xendrive: "" } },
    );
  }

  await users.updateMany(
    { pinnedApps: "xendrive" },
    { $set: { "pinnedApps.$[p]": "xenbox" } },
    { arrayFilters: [{ p: "xendrive" }] },
  );

  await users.updateMany(
    { "inventory.itemKey": "1gb-xendrive-voucher" },
    {
      $set: {
        "inventory.$[i].itemKey": "1gb-xenbox-voucher",
        "inventory.$[i].name": "1GB XenBox Voucher",
        "inventory.$[i].description": "Redeem this voucher to get 1GB of XenBox space added to your account",
      },
    },
    { arrayFilters: [{ "i.itemKey": "1gb-xendrive-voucher" }] },
  );
}
