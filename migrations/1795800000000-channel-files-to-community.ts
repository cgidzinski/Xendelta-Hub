// Files stored in a community's channels, and the community's custom emoji, are paid for by the community (#356,
// docs/billing.md), not by whoever uploaded them. Sets `payer` on those records; the uploader stays on `uploadedBy`, so
// they still see and can delete their own channel files in the storage viewer. Channel files no longer count toward the
// uploader's quota (`counted: false`). No object in a bucket is touched.
//
// `up` is repeatable. `down` puts the uploader back as the payer and the files back on their quota.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const records = connection.collection("filerecords");
  let files = 0;
  for await (const c of connection
    .collection("conversations")
    .find({ communityId: { $exists: true, $ne: null } }, { projection: { communityId: 1 } })) {
    const res = await records.updateMany(
      { bucket: "private", "space.app": "chat", "space.ref": String(c._id) },
      { $set: { payer: { type: "community", id: String(c.communityId) }, counted: false } },
    );
    files += res.modifiedCount;
  }
  let emoji = 0;
  for await (const e of connection
    .collection("customemojis")
    .find({ communityId: { $exists: true, $ne: null } }, { projection: { storagePath: 1, communityId: 1 } })) {
    const res = await records.updateOne(
      { bucket: "public", key: e.storagePath },
      { $set: { payer: { type: "community", id: String(e.communityId) } } },
    );
    emoji += res.modifiedCount;
  }
  console.log(`channel-files-to-community: ${files} files and ${emoji} emoji are the community's`);
}

export async function down(connection: Connection): Promise<void> {
  const records = connection.collection("filerecords");
  for await (const r of records.find({ "payer.type": "community" }, { projection: { uploadedBy: 1, bucket: 1 } })) {
    await records.updateOne(
      { _id: r._id },
      {
        $set: {
          payer: r.uploadedBy ? { type: "user", id: String(r.uploadedBy) } : { type: "house" },
          ...(r.bucket === "private" ? { counted: true } : {}),
        },
      },
    );
  }
}
