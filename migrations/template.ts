// Template used by `npm run db:migrate:create <name>` (see migrate.ts -> templatePath).
//
// Conventions for this repo:
//   * Use raw collection access (`connection.collection("<name>")`) rather than
//     importing Mongoose models, so a migration keeps doing what it did even after
//     the schema moves on. Collection names are the lower-cased, pluralised model
//     name, e.g. XenBudgetItem -> "xenbudgetitems".
//   * Make `up` idempotent where you reasonably can (guard with a filter / `$exists`)
//     so a half-finished run can be re-run safely.
//   * Always write a real `down`. If the change genuinely cannot be reversed, throw
//     with a one-line reason instead of leaving it empty.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  // const items = connection.collection("xenbudgetitems");
  // await items.updateMany({ currency: { $exists: false } }, { $set: { currency: "CAD" } });
  throw new Error("migration not implemented");
}

export async function down(connection: Connection): Promise<void> {
  // Reverse of up(). If irreversible:
  //   throw new Error("irreversible: <reason>");
  throw new Error("down not implemented");
}
