// App files (chat attachments and the photos in XenSplit, XenBudget, XenNote, XenKitchen and XenRoutine) stop being
// XenDrive items; each is only a FileRecord now (#380, models/fileRecord.ts). Run after 1795600000000-file-records.
//
//   1. Every record takes what only its XenDrive file knew: the quota flag and the thumbnail's size and status.
//   2. The XenDrive file documents that apps stored (`source.app` set) are deleted. The record has the same _id, so
//      the `file_id` an expense, note or message holds still finds it. No object in a bucket is touched.
//
// `up` is repeatable: a file already gone is skipped. `down` makes an item document again for every app record that has
// none (the same _id), so the previous version works.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  const records = connection.collection("filerecords");
  let moved = 0;
  for await (const f of files.find({})) {
    const source = f.source?.app ? { app: String(f.source.app), ref: String(f.source.ref ?? "") } : null;
    // A file whose status is "none" adds nothing (and a second run finds a drive item already reset to "none").
    const set: Record<string, unknown> = { counted: f.counted !== false };
    if (f.thumbStatus && f.thumbStatus !== "none") set.thumbStatus = f.thumbStatus;
    if (f.thumb?.path) {
      set.thumbKey = f.thumb.path;
      set.thumbWidth = f.thumb.width ?? 0;
      set.thumbHeight = f.thumb.height ?? 0;
    }
    await records.updateOne(
      { _id: f._id },
      {
        $set: set,
        $setOnInsert: {
          bucket: "private",
          key: f.storage_path,
          size: f.size ?? 0,
          mimeType: f.mimeType || "application/octet-stream",
          name: f.name || "",
          uploadedBy: f.owner_id,
          createdAt: f.createdAt ?? new Date(),
          payer: { type: "user", id: String(f.owner_id) },
          space: source ?? { app: "xendrive", ref: String(f.owner_id) },
        },
      },
      { upsert: true },
    );
    if (source) {
      await files.deleteOne({ _id: f._id });
      moved += 1;
    } else {
      // A XenDrive item's thumbnail now follows its record's status.
      await files.updateOne({ _id: f._id, thumbStatus: "pending" }, { $set: { thumbStatus: "none" } });
    }
  }
  console.log(`app-files-to-records: ${moved} app files are records only`);
}

export async function down(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  for await (const r of connection
    .collection("filerecords")
    .find({ bucket: "private", "space.app": { $ne: "xendrive" } })) {
    if (await files.findOne({ _id: r._id }, { projection: { _id: 1 } })) continue;
    await files.insertOne({
      _id: r._id,
      owner_id: r.uploadedBy,
      folder_id: null,
      name: r.name,
      storage_path: r.key,
      mimeType: r.mimeType,
      size: r.size,
      createdAt: r.createdAt,
      source: { app: r.space.app, ref: r.space.ref ?? "" },
      counted: r.counted !== false,
      thumbStatus: r.thumbStatus ?? "none",
      ...(r.thumbKey ? { thumb: { path: r.thumbKey, width: r.thumbWidth ?? 0, height: r.thumbHeight ?? 0 } } : {}),
    });
  }
}
