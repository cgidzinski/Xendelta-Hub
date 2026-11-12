// Points became gems (#180). This migration:
//   1. renames users.points to users.gems, keeping every balance one for one;
//   2. renames the held "1000-point-voucher" inventory item to "1000-gem-voucher".
// New accounts now start with 0 gems instead of 1000 (the schema default); that needs no data change.
// Both steps are guarded, so re-running after a partial run is safe.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const users = connection.collection("users");

  await users.updateMany({ points: { $exists: true }, gems: { $exists: false } }, { $rename: { points: "gems" } });
  // A document with both fields would be a half-applied run on a user who has since got gems; keep the gems.
  await users.updateMany({ points: { $exists: true }, gems: { $exists: true } }, { $unset: { points: "" } });

  await users.updateMany(
    { "inventory.itemKey": "1000-point-voucher" },
    {
      $set: {
        "inventory.$[i].itemKey": "1000-gem-voucher",
        "inventory.$[i].name": "1000 Gem Voucher",
        "inventory.$[i].description": "Redeem this voucher to get 1000 gems added to your account",
      },
    },
    { arrayFilters: [{ "i.itemKey": "1000-point-voucher" }] },
  );
}

export async function down(connection: Connection): Promise<void> {
  const users = connection.collection("users");

  await users.updateMany({ gems: { $exists: true }, points: { $exists: false } }, { $rename: { gems: "points" } });

  await users.updateMany(
    { "inventory.itemKey": "1000-gem-voucher" },
    {
      $set: {
        "inventory.$[i].itemKey": "1000-point-voucher",
        "inventory.$[i].name": "1000 Point Voucher",
        "inventory.$[i].description": "Redeem this voucher to get 1000 points added to your account",
      },
    },
    { arrayFilters: [{ "i.itemKey": "1000-gem-voucher" }] },
  );
}
