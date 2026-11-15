// A XenDrive item keeps only what XenDrive shows (owner, folder, name) and its link; where the bytes are, their size and type
// and the thumbnail live on the file's FileRecord (the same _id, `file` points at it) (#380). Removes the fields the item no
// longer holds. Run after 1795600000000-file-records and 1795700000000-app-files-to-records.
//
// Only an item whose record exists is touched, so nothing is lost if a record is missing: it keeps its fields and is left for
// db:stats to report. `up` is repeatable. `down` copies the fields back from the records.
import type { Connection } from "mongoose";

const OLD_FIELDS = { storage_path: "", mimeType: "", size: "", thumb: "", thumbStatus: "", source: "", counted: "" };

export async function up(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  const records = connection.collection("filerecords");
  let slimmed = 0;
  let kept = 0;
  for await (const f of files.find({}, { projection: { _id: 1, file: 1 } })) {
    if (!(await records.findOne({ _id: f.file ?? f._id }, { projection: { _id: 1 } }))) {
      kept += 1;
      console.warn(`slim-drive-files: no record for XenDrive file ${f._id}; left as it is`);
      continue;
    }
    const res = await files.updateOne({ _id: f._id }, { $set: { file: f.file ?? f._id }, $unset: OLD_FIELDS });
    slimmed += res.modifiedCount;
  }
  console.log(`slim-drive-files: ${slimmed} items slimmed${kept ? `, ${kept} left (no record)` : ""}`);
}

export async function down(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  for await (const f of files.find({ storage_path: { $exists: false } }, { projection: { file: 1 } })) {
    const r = await connection.collection("filerecords").findOne({ _id: f.file ?? f._id });
    if (!r) continue;
    await files.updateOne(
      { _id: f._id },
      {
        $set: {
          storage_path: r.key,
          mimeType: r.mimeType,
          size: r.size,
          thumbStatus: r.thumbStatus ?? "none",
          ...(r.thumbKey ? { thumb: { path: r.thumbKey, width: r.thumbWidth ?? 0, height: r.thumbHeight ?? 0 } } : {}),
        },
      },
    );
  }
}
