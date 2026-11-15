// Data nothing in the code reads any more, found by the "Unused data" section of `npm run db:stats`:
//   - the collections of the removed casino app (xencasino*);
//   - users.weeabetsAccountId (an old integration), xenbudgetbooks.savings_goals (from before piggy banks) and
//     xenroutinesettings.digest (a removed setting).
// Only these names are touched, never "whatever has no model": a collection a new app hasn't registered yet is safe.
//
// `up` is repeatable: a collection already gone or a field already unset is skipped.
//
// `down` can't bring the data back. Restore from a backup to get it.
import type { Connection } from "mongoose";

const COLLECTIONS = [
  "xencasinos",
  "xencasinoactivities",
  "xencasinogardenstates",
  "xencasinominestates",
  "xencasinoprinterstates",
  "xencasinoranchcreatures",
  "xencasinoranches",
  "xencasinoranchinventories",
  "xencasinoranchpendingraces",
  "xencasinorounds",
  "xencasinouserstates",
];

const FIELDS: Array<[collection: string, field: string]> = [
  ["users", "weeabetsAccountId"],
  ["xenbudgetbooks", "savings_goals"],
  ["xenroutinesettings", "digest"],
];

export async function up(connection: Connection): Promise<void> {
  const db = connection.db!;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    if (existing.has(name)) await db.dropCollection(name);
  }
  for (const [collection, field] of FIELDS) {
    if (existing.has(collection)) {
      await db.collection(collection).updateMany({ [field]: { $exists: true } }, { $unset: { [field]: "" } });
    }
  }
}

export async function down(): Promise<void> {
  throw new Error("irreversible: the dropped collections and fields are gone; restore from a backup to get them back");
}
