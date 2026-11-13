// XenDrive link passwords (#256). A file's link password used to be stored as plain text in `xendrivefiles.password` and
// sent back to its owner. It is now a bcrypt hash in `passwordHash`, and the plain-text field is removed.
//
// `up` is repeatable: it only touches files that still have `password`. A file that has both (a password set again by
// the new code before this ran) keeps the new hash and just loses the old text.
//
// `down` can't undo it: a hash can't be turned back into the password. Rolling back the code leaves these files
// without a password, so their links would open to anyone who has the link. Restore from a backup instead.
import type { Connection } from "mongoose";
import bcrypt from "bcryptjs";

export async function up(connection: Connection): Promise<void> {
  const files = connection.collection("xendrivefiles");
  const old = files.find({ password: { $exists: true } }, { projection: { password: 1, passwordHash: 1 } });
  for await (const file of old) {
    const plain = typeof file.password === "string" ? file.password : "";
    const update: Record<string, unknown> = { $unset: { password: "" } };
    if (plain && !file.passwordHash) update.$set = { passwordHash: await bcrypt.hash(plain, 10) };
    await files.updateOne({ _id: file._id }, update);
  }
}

export async function down(): Promise<void> {
  throw new Error("irreversible: passwords are one-way hashes now; restore from a backup to get the old ones back");
}
