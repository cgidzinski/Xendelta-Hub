import type { Connection } from "mongoose";
import type { ObjectId } from "mongodb";

const cutover = "notebook-pages";
const backupName = "xennotes_premigration";
const legacyIndexes = ["notebook_id_1_updated_at_-1", "owner_id_1_notebook_id_1"];

export async function up(connection: Connection): Promise<void> {
  const db = connection.db!;
  const state = db.collection("xennote_migration_state");
  const notes = db.collection("xennotes");
  if (!(await state.findOne({ name: cutover, active: true }))) {
    throw new Error("XenNote notebook notes must be migrated to pages before cleanup");
  }
  if (await notes.findOne({ notebook_id: { $ne: null } }, { projection: { _id: 1 } })) {
    throw new Error("XenNote cleanup found notebook notes that have not been migrated to pages");
  }

  // Fence the old migration before deleting any of the records its rollback needs.
  await state.updateOne({ name: cutover, contracted_at: { $exists: false } }, { $set: { contracted_at: new Date() } });

  if (await db.listCollections({ name: backupName }).hasNext()) {
    const backups = db.collection(backupName);
    const versions = db.collection("xennoteversions");
    const ids: ObjectId[] = [];
    for await (const { _id } of backups.find({}, { projection: { _id: 1 } })) {
      ids.push(_id);
      if (ids.length === 500) {
        await versions.deleteMany({ note_id: { $in: ids } });
        ids.length = 0;
      }
    }
    if (ids.length) await versions.deleteMany({ note_id: { $in: ids } });
    await backups.drop();
  }

  if (await db.listCollections({ name: notes.collectionName }).hasNext()) {
    await notes.updateMany({ notebook_id: { $type: "null" } }, { $unset: { notebook_id: "" } });
    for (const index of await notes.listIndexes().toArray()) {
      if (index.name && legacyIndexes.includes(index.name)) await notes.dropIndex(index.name);
    }
  }
  await db
    .collection("xennotebooks")
    .updateMany(
      { $or: [{ pages_migrated_at: { $exists: true } }, { notes_migration_section_id: { $exists: true } }] },
      { $unset: { pages_migrated_at: "", notes_migration_section_id: "" } },
    );
  for (const name of ["xennotepages", "xennotepageversions"]) {
    await db
      .collection(name)
      .updateMany({ migrated_from_note: { $exists: true } }, { $unset: { migrated_from_note: "" } });
  }
}

export async function down(): Promise<void> {
  throw new Error(
    "The XenNote notebook-note cleanup is irreversible. Restore a database backup to recover legacy data.",
  );
}
